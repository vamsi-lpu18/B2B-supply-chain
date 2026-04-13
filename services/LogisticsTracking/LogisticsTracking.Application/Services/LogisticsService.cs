using FluentValidation;
using LogisticsTracking.Application.Abstractions;
using LogisticsTracking.Application.DTOs;
using LogisticsTracking.Domain.Entities;
using LogisticsTracking.Domain.Enums;
using System.Collections.Concurrent;

namespace LogisticsTracking.Application.Services;

public sealed class LogisticsService(
    IShipmentRepository shipmentRepository,
    IShipmentAiRecommendationProvider aiRecommendationProvider,
    IValidator<CreateShipmentRequest> createValidator,
    IValidator<AssignAgentRequest> assignValidator,
    IValidator<RejectAssignmentRequest> rejectAssignmentValidator,
    IValidator<RateDeliveryAgentRequest> rateDeliveryAgentValidator,
    IValidator<AssignVehicleRequest> assignVehicleValidator,
    IValidator<UpdateShipmentStatusRequest> statusValidator)
    : ILogisticsService
{
    private enum AiActionKind
    {
        UpdateStatus,
        SetRetryState,
        NoAction
    }

    private sealed record AiSuggestedAction(
        AiActionKind Kind,
        ShipmentStatus? Status,
        string Description,
        string ProposedValue,
        HandoverState? HandoverState = null,
        bool RetryRequired = false,
        int RetryCount = 0,
        string? RetryReason = null,
        DateTime? NextRetryAtUtc = null);

    private sealed record AiRecommendationState(
        Guid RecommendationId,
        Guid ShipmentId,
        string PlaybookType,
        double ConfidenceScore,
        string ExplanationText,
        bool RequiresHumanApproval,
        DateTime CreatedAtUtc,
        IReadOnlyList<AiSuggestedAction> SuggestedActions);

    private static readonly ConcurrentDictionary<Guid, AiRecommendationState> AiRecommendations = new();

    public async Task<ShipmentDto> CreateShipmentAsync(CreateShipmentRequest request, Guid createdByUserId, string createdByRole, CancellationToken cancellationToken)
    {
        await createValidator.ValidateAndThrowAsync(request, cancellationToken);

        var shipment = Shipment.Create(
            request.OrderId,
            request.DealerId,
            GenerateShipmentNumber(),
            request.DeliveryAddress,
            request.City,
            request.State,
            request.PostalCode,
            createdByUserId,
            createdByRole);

        await shipmentRepository.AddShipmentAsync(shipment, cancellationToken);
        await shipmentRepository.UpsertShipmentOpsStateAsync(ShipmentOpsState.CreateDefault(shipment), cancellationToken);
        await shipmentRepository.AddOutboxMessageAsync("ShipmentCreated", new
        {
            shipment.ShipmentId,
            shipment.OrderId,
            shipment.DealerId,
            shipment.ShipmentNumber,
            shipment.Status,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        await shipmentRepository.SaveChangesAsync(cancellationToken);

        return MapShipment(shipment);
    }

    public async Task<ShipmentDto?> GetShipmentAsync(Guid shipmentId, CancellationToken cancellationToken)
    {
        var shipment = await shipmentRepository.GetShipmentByIdAsync(shipmentId, cancellationToken);
        return shipment is null ? null : MapShipment(shipment);
    }

    public async Task<IReadOnlyList<ShipmentDto>> GetDealerShipmentsAsync(Guid dealerId, CancellationToken cancellationToken)
    {
        var shipments = await shipmentRepository.GetDealerShipmentsAsync(dealerId, cancellationToken);
        return shipments.Select(MapShipment).ToList();
    }

    public async Task<IReadOnlyList<ShipmentDto>> GetAgentShipmentsAsync(Guid agentId, CancellationToken cancellationToken)
    {
        var shipments = await shipmentRepository.GetAgentShipmentsAsync(agentId, cancellationToken);
        return shipments.Select(MapShipment).ToList();
    }

    public async Task<IReadOnlyList<ShipmentDto>> GetAllShipmentsAsync(CancellationToken cancellationToken)
    {
        var shipments = await shipmentRepository.GetAllShipmentsAsync(cancellationToken);
        return shipments.Select(MapShipment).ToList();
    }

    public async Task<bool> AssignAgentAsync(Guid shipmentId, Guid agentId, Guid updatedByUserId, string updatedByRole, CancellationToken cancellationToken)
    {
        await assignValidator.ValidateAndThrowAsync(new AssignAgentRequest(agentId), cancellationToken);

        var shipment = await shipmentRepository.GetShipmentByIdAsync(shipmentId, cancellationToken);
        if (shipment is null)
        {
            return false;
        }

        shipment.AssignAgent(agentId, updatedByUserId, updatedByRole);
        await SyncOpsStateWithShipmentAsync(shipment, cancellationToken);

        await shipmentRepository.AddOutboxMessageAsync("ShipmentAssigned", new
        {
            shipment.ShipmentId,
            shipment.OrderId,
            shipment.DealerId,
            shipment.AssignedAgentId,
            shipment.AssignmentDecisionStatus,
            shipment.Status,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        try
        {
            await shipmentRepository.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (Exception ex) when (IsDbUpdateConcurrencyException(ex))
        {
            return false;
        }
    }

    public async Task<bool> AcceptAssignmentAsync(Guid shipmentId, Guid agentId, Guid updatedByUserId, string updatedByRole, CancellationToken cancellationToken)
    {
        await assignValidator.ValidateAndThrowAsync(new AssignAgentRequest(agentId), cancellationToken);

        var shipment = await shipmentRepository.GetShipmentByIdAsync(shipmentId, cancellationToken);
        if (shipment is null || shipment.AssignedAgentId != agentId)
        {
            return false;
        }

        shipment.AcceptAssignment(updatedByUserId, updatedByRole);
        await SyncOpsStateWithShipmentAsync(shipment, cancellationToken);

        await shipmentRepository.AddOutboxMessageAsync("ShipmentAssignmentAccepted", new
        {
            shipment.ShipmentId,
            shipment.OrderId,
            shipment.DealerId,
            shipment.AssignedAgentId,
            shipment.AssignmentDecisionStatus,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        try
        {
            await shipmentRepository.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (Exception ex) when (IsDbUpdateConcurrencyException(ex))
        {
            return false;
        }
    }

    public async Task<bool> RejectAssignmentAsync(Guid shipmentId, Guid agentId, string reason, Guid updatedByUserId, string updatedByRole, CancellationToken cancellationToken)
    {
        await assignValidator.ValidateAndThrowAsync(new AssignAgentRequest(agentId), cancellationToken);
        await rejectAssignmentValidator.ValidateAndThrowAsync(new RejectAssignmentRequest(reason), cancellationToken);

        var shipment = await shipmentRepository.GetShipmentByIdAsync(shipmentId, cancellationToken);
        if (shipment is null || shipment.AssignedAgentId != agentId)
        {
            return false;
        }

        shipment.RejectAssignment(reason, updatedByUserId, updatedByRole);
        await SyncOpsStateWithShipmentAsync(shipment, cancellationToken);

        await shipmentRepository.AddOutboxMessageAsync("ShipmentAssignmentRejected", new
        {
            shipment.ShipmentId,
            shipment.OrderId,
            shipment.DealerId,
            rejectedAgentId = agentId,
            reason,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        try
        {
            await shipmentRepository.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (Exception ex) when (IsDbUpdateConcurrencyException(ex))
        {
            return false;
        }
    }

    public async Task<bool> RateDeliveryAgentAsync(Guid shipmentId, int rating, string? comment, Guid ratedByUserId, string ratedByRole, CancellationToken cancellationToken)
    {
        await rateDeliveryAgentValidator.ValidateAndThrowAsync(new RateDeliveryAgentRequest(rating, comment), cancellationToken);

        var shipment = await shipmentRepository.GetShipmentByIdAsync(shipmentId, cancellationToken);
        if (shipment is null)
        {
            return false;
        }

        shipment.RateDeliveryAgent(rating, comment, ratedByUserId, ratedByRole);

        await shipmentRepository.AddOutboxMessageAsync("ShipmentAgentRated", new
        {
            shipment.ShipmentId,
            shipment.OrderId,
            shipment.DealerId,
            shipment.AssignedAgentId,
            RecipientUserId = shipment.AssignedAgentId,
            shipment.DeliveryAgentRating,
            Comment = shipment.DeliveryAgentRatingComment,
            shipment.DeliveryAgentRatedByUserId,
            shipment.DeliveryAgentRatedAtUtc,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        try
        {
            await shipmentRepository.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (Exception ex) when (IsDbUpdateConcurrencyException(ex))
        {
            return false;
        }
    }

    public async Task<bool> AssignVehicleAsync(Guid shipmentId, string vehicleNumber, Guid updatedByUserId, string updatedByRole, CancellationToken cancellationToken)
    {
        await assignVehicleValidator.ValidateAndThrowAsync(new AssignVehicleRequest(vehicleNumber), cancellationToken);

        var shipment = await shipmentRepository.GetShipmentByIdAsync(shipmentId, cancellationToken);
        if (shipment is null)
        {
            return false;
        }

        var normalizedVehicleNumber = vehicleNumber.Trim().ToUpperInvariant();
        if (string.Equals(shipment.VehicleNumber, normalizedVehicleNumber, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        shipment.AssignVehicle(normalizedVehicleNumber, updatedByUserId, updatedByRole);
        await SyncOpsStateWithShipmentAsync(shipment, cancellationToken);

        await shipmentRepository.AddOutboxMessageAsync("ShipmentVehicleAssigned", new
        {
            shipment.ShipmentId,
            shipment.OrderId,
            shipment.DealerId,
            shipment.VehicleNumber,
            shipment.Status,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        try
        {
            await shipmentRepository.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (Exception ex) when (IsDbUpdateConcurrencyException(ex))
        {
            return false;
        }
    }

    public async Task<bool> UpdateShipmentStatusAsync(Guid shipmentId, ShipmentStatus status, string note, Guid updatedByUserId, string updatedByRole, CancellationToken cancellationToken)
    {
        await statusValidator.ValidateAndThrowAsync(new UpdateShipmentStatusRequest(status, note), cancellationToken);

        var shipment = await shipmentRepository.GetShipmentByIdAsync(shipmentId, cancellationToken);
        if (shipment is null)
        {
            return false;
        }

        if (string.Equals(updatedByRole, "Agent", StringComparison.Ordinal)
            && RequiresVehicleForAgentStatus(status)
            && string.IsNullOrWhiteSpace(shipment.VehicleNumber))
        {
            throw new InvalidOperationException("Vehicle must be assigned before an agent can set InTransit, OutForDelivery, or Delivered.");
        }

        shipment.UpdateStatus(status, note, updatedByUserId, updatedByRole);
        await SyncOpsStateWithShipmentAsync(shipment, cancellationToken);

        await shipmentRepository.AddOutboxMessageAsync("ShipmentStatusUpdated", new
        {
            shipment.ShipmentId,
            shipment.OrderId,
            shipment.DealerId,
            shipment.Status,
            note,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        try
        {
            await shipmentRepository.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (Exception ex) when (IsDbUpdateConcurrencyException(ex))
        {
            return false;
        }
    }

    public async Task<ShipmentOpsStateDto?> GetShipmentOpsStateAsync(Guid shipmentId, CancellationToken cancellationToken)
    {
        var shipment = await shipmentRepository.GetShipmentByIdAsync(shipmentId, cancellationToken);
        if (shipment is null)
        {
            return null;
        }

        var state = await shipmentRepository.GetShipmentOpsStateAsync(shipmentId, cancellationToken);
        var isNew = state is null;
        state ??= ShipmentOpsState.CreateDefault(shipment);

        var changed = state.SyncWithShipment(shipment);
        if (isNew || changed)
        {
            await shipmentRepository.UpsertShipmentOpsStateAsync(state, cancellationToken);
            await shipmentRepository.SaveChangesAsync(cancellationToken);
        }

        return MapOpsState(state);
    }

    public async Task<IReadOnlyList<ShipmentOpsStateDto>> GetShipmentOpsStatesAsync(GetShipmentOpsStatesRequest request, CancellationToken cancellationToken)
    {
        var requestedIds = (request.ShipmentIds ?? [])
            .Where(x => x != Guid.Empty)
            .Distinct()
            .ToArray();

        if (requestedIds.Length == 0)
        {
            return [];
        }

        var shipments = await shipmentRepository.GetShipmentsByIdsAsync(requestedIds, cancellationToken);
        if (shipments.Count == 0)
        {
            return [];
        }

        var shipmentById = shipments.ToDictionary(x => x.ShipmentId);
        var states = await shipmentRepository.GetShipmentOpsStatesAsync(requestedIds, cancellationToken);
        var stateById = states.ToDictionary(x => x.ShipmentId);
        var changed = false;

        foreach (var shipment in shipments)
        {
            if (!stateById.TryGetValue(shipment.ShipmentId, out var state))
            {
                state = ShipmentOpsState.CreateDefault(shipment);
                await shipmentRepository.UpsertShipmentOpsStateAsync(state, cancellationToken);
                stateById[shipment.ShipmentId] = state;
                changed = true;
            }

            if (state.SyncWithShipment(shipment))
            {
                await shipmentRepository.UpsertShipmentOpsStateAsync(state, cancellationToken);
                changed = true;
            }
        }

        if (changed)
        {
            await shipmentRepository.SaveChangesAsync(cancellationToken);
        }

        return requestedIds
            .Where(shipmentById.ContainsKey)
            .Select(id => MapOpsState(stateById[id]))
            .ToList();
    }

    public async Task<ShipmentOpsStateDto?> UpsertShipmentOpsStateAsync(Guid shipmentId, UpsertShipmentOpsStateRequest request, CancellationToken cancellationToken)
    {
        var shipment = await shipmentRepository.GetShipmentByIdAsync(shipmentId, cancellationToken);
        if (shipment is null)
        {
            return null;
        }

        var state = await shipmentRepository.GetShipmentOpsStateAsync(shipmentId, cancellationToken)
            ?? ShipmentOpsState.CreateDefault(shipment);

        state.Update(
            ParseHandoverState(request.HandoverState, state.HandoverState),
            NormalizeText(request.HandoverExceptionReason, 300),
            request.RetryRequired ?? false,
            request.RetryCount ?? 0,
            NormalizeText(request.RetryReason, 300),
            NormalizeOptionalUtc(request.NextRetryAtUtc),
            NormalizeOptionalUtc(request.LastRetryScheduledAtUtc));

        state.SyncWithShipment(shipment);
        await shipmentRepository.UpsertShipmentOpsStateAsync(state, cancellationToken);
        await shipmentRepository.SaveChangesAsync(cancellationToken);

        return MapOpsState(state);
    }

    public async Task<ShipmentAiRecommendationDto?> GenerateAiRecommendationAsync(Guid shipmentId, Guid requestedByUserId, string requestedByRole, CancellationToken cancellationToken)
    {
        var shipment = await shipmentRepository.GetShipmentByIdAsync(shipmentId, cancellationToken);
        if (shipment is null)
        {
            return null;
        }

        var recommendation = await TryBuildProviderRecommendationAsync(shipment, requestedByRole, cancellationToken)
            ?? BuildAiRecommendation(shipment, requestedByRole);
        AiRecommendations[recommendation.RecommendationId] = recommendation;

        return MapAiRecommendation(recommendation);
    }

    public async Task<ApproveAiRecommendationResultDto?> ApproveAiRecommendationAsync(Guid recommendationId, Guid approvedByUserId, string approvedByRole, CancellationToken cancellationToken)
    {
        if (!AiRecommendations.TryGetValue(recommendationId, out var recommendation))
        {
            return null;
        }

        if (recommendation.CreatedAtUtc < DateTime.UtcNow.AddHours(-6))
        {
            AiRecommendations.TryRemove(recommendationId, out _);
            return null;
        }

        var shipment = await shipmentRepository.GetShipmentByIdAsync(recommendation.ShipmentId, cancellationToken);
        if (shipment is null)
        {
            AiRecommendations.TryRemove(recommendationId, out _);
            return null;
        }

        var steps = new List<AiRecommendationExecutionStepDto>();

        foreach (var action in recommendation.SuggestedActions)
        {
            switch (action.Kind)
            {
                case AiActionKind.UpdateStatus:
                    if (!action.Status.HasValue)
                    {
                        steps.Add(new AiRecommendationExecutionStepDto(
                            ToActionTypeText(action.Kind),
                            "skipped",
                            "No target status provided."));
                        break;
                    }

                    if (shipment.Status is ShipmentStatus.Delivered or ShipmentStatus.Returned)
                    {
                        steps.Add(new AiRecommendationExecutionStepDto(
                            ToActionTypeText(action.Kind),
                            "skipped",
                            "Shipment is already completed."));
                        break;
                    }

                    shipment.UpdateStatus(action.Status.Value, action.Description, approvedByUserId, approvedByRole);
                    await SyncOpsStateWithShipmentAsync(shipment, cancellationToken);

                    await shipmentRepository.AddOutboxMessageAsync("ShipmentStatusUpdated", new
                    {
                        shipment.ShipmentId,
                        shipment.OrderId,
                        shipment.DealerId,
                        shipment.Status,
                        note = action.Description,
                        occurredAtUtc = DateTime.UtcNow
                    }, cancellationToken);

                    steps.Add(new AiRecommendationExecutionStepDto(
                        ToActionTypeText(action.Kind),
                        "executed",
                        $"Shipment status moved to {action.Status.Value}."));
                    break;

                case AiActionKind.SetRetryState:
                    {
                        var state = await shipmentRepository.GetShipmentOpsStateAsync(shipment.ShipmentId, cancellationToken)
                            ?? ShipmentOpsState.CreateDefault(shipment);

                        state.Update(
                            action.HandoverState ?? state.HandoverState,
                            action.RetryRequired ? "AI suggested retry workflow." : state.HandoverExceptionReason,
                            action.RetryRequired,
                            action.RetryCount,
                            action.RetryReason,
                            action.NextRetryAtUtc,
                            DateTime.UtcNow);

                        await shipmentRepository.UpsertShipmentOpsStateAsync(state, cancellationToken);

                        steps.Add(new AiRecommendationExecutionStepDto(
                            ToActionTypeText(action.Kind),
                            "executed",
                            action.Description));
                        break;
                    }

                default:
                    steps.Add(new AiRecommendationExecutionStepDto(
                        ToActionTypeText(action.Kind),
                        "no-op",
                        action.Description));
                    break;
            }
        }

        await shipmentRepository.AddOutboxMessageAsync("ShipmentAiRecommendationExecuted", new
        {
            recommendationId,
            shipmentId = shipment.ShipmentId,
            approvedByUserId,
            approvedByRole,
            executedAtUtc = DateTime.UtcNow,
            actionCount = steps.Count
        }, cancellationToken);

        await shipmentRepository.SaveChangesAsync(cancellationToken);
        AiRecommendations.TryRemove(recommendationId, out _);

        return new ApproveAiRecommendationResultDto(
            recommendationId,
            shipment.ShipmentId,
            true,
            DateTime.UtcNow,
            steps,
            MapShipment(shipment));
    }

    private async Task<AiRecommendationState?> TryBuildProviderRecommendationAsync(Shipment shipment, string requestedByRole, CancellationToken cancellationToken)
    {
        ShipmentAiGenerationResult? generated;

        try
        {
            generated = await aiRecommendationProvider.GenerateAsync(
                new ShipmentAiGenerationRequest(
                    shipment.ShipmentId,
                    shipment.Status,
                    shipment.AssignedAgentId,
                    shipment.VehicleNumber,
                    requestedByRole,
                    DateTime.UtcNow),
                cancellationToken);
        }
        catch
        {
            return null;
        }

        if (generated is null)
        {
            return null;
        }

        return BuildAiRecommendationFromProvider(shipment.ShipmentId, generated);
    }

    private static AiRecommendationState? BuildAiRecommendationFromProvider(Guid shipmentId, ShipmentAiGenerationResult generated)
    {
        var actions = generated.SuggestedActions
            .Select(MapProviderAction)
            .Where(x => x is not null)
            .Cast<AiSuggestedAction>()
            .Take(3)
            .ToList();

        if (actions.Count == 0)
        {
            return null;
        }

        var playbookType = NormalizeText(generated.PlaybookType, 80) ?? "AiGenerated";
        var explanationText = NormalizeText(generated.ExplanationText, 500)
            ?? "AI recommendation generated from shipment context.";

        return new AiRecommendationState(
            Guid.NewGuid(),
            shipmentId,
            playbookType,
            Math.Clamp(generated.ConfidenceScore, 0d, 1d),
            explanationText,
            true,
            DateTime.UtcNow,
            actions);
    }

    private static AiSuggestedAction? MapProviderAction(ShipmentAiGeneratedAction action)
    {
        var actionType = (NormalizeText(action.ActionType, 40) ?? string.Empty).ToLowerInvariant();
        var description = NormalizeText(action.Description, 300) ?? "AI suggested action.";
        var proposedValue = NormalizeText(action.ProposedValue, 120) ?? "NoAction";

        return actionType switch
        {
            "update-status" when action.Status.HasValue => new AiSuggestedAction(
                AiActionKind.UpdateStatus,
                action.Status,
                description,
                proposedValue),

            "set-retry-state" => new AiSuggestedAction(
                AiActionKind.SetRetryState,
                null,
                description,
                proposedValue,
                action.HandoverState,
                action.RetryRequired,
                Math.Max(0, action.RetryCount),
                NormalizeText(action.RetryReason, 300),
                NormalizeOptionalUtc(action.NextRetryAtUtc)),

            "no-action" => new AiSuggestedAction(
                AiActionKind.NoAction,
                null,
                description,
                proposedValue),

            _ => null
        };
    }

    private static AiRecommendationState BuildAiRecommendation(Shipment shipment, string requestedByRole)
    {
        var playbookType = "DelayRecovery";
        var confidence = 0.72d;
        var actions = new List<AiSuggestedAction>();
        var explanationParts = new List<string>
        {
            $"Current shipment status is {shipment.Status}."
        };

        if (!shipment.AssignedAgentId.HasValue && shipment.Status is not ShipmentStatus.Delivered and not ShipmentStatus.Returned)
        {
            explanationParts.Add("No assigned agent detected.");
        }

        if (string.IsNullOrWhiteSpace(shipment.VehicleNumber) && shipment.Status is ShipmentStatus.InTransit or ShipmentStatus.OutForDelivery)
        {
            explanationParts.Add("Vehicle number is missing for an active delivery stage.");
        }

        switch (shipment.Status)
        {
            case ShipmentStatus.Created:
                playbookType = "AssignmentKickstart";
                confidence = 0.74d;
                actions.Add(new AiSuggestedAction(
                    AiActionKind.UpdateStatus,
                    ShipmentStatus.Assigned,
                    "AI playbook: move shipment to Assigned to start fulfillment.",
                    "Assigned"));
                break;

            case ShipmentStatus.Assigned:
                playbookType = "PickupAcceleration";
                confidence = 0.75d;
                actions.Add(new AiSuggestedAction(
                    AiActionKind.UpdateStatus,
                    ShipmentStatus.PickedUp,
                    "AI playbook: progress shipment to PickedUp to reduce idle time.",
                    "PickedUp"));
                break;

            case ShipmentStatus.PickedUp:
                playbookType = "TransitAcceleration";
                confidence = 0.77d;
                actions.Add(new AiSuggestedAction(
                    AiActionKind.UpdateStatus,
                    ShipmentStatus.InTransit,
                    "AI playbook: progress shipment to InTransit for active tracking.",
                    "InTransit"));
                break;

            case ShipmentStatus.InTransit:
                playbookType = "DeliveryRecovery";
                confidence = 0.81d;
                actions.Add(new AiSuggestedAction(
                    AiActionKind.UpdateStatus,
                    ShipmentStatus.OutForDelivery,
                    "AI playbook: route shipment to OutForDelivery for faster completion.",
                    "OutForDelivery"));
                actions.Add(new AiSuggestedAction(
                    AiActionKind.SetRetryState,
                    null,
                    "AI playbook: clear retry flags and mark handover ready.",
                    "RetryRequired=false",
                    HandoverState.Ready,
                    false,
                    0,
                    null,
                    null));
                break;

            case ShipmentStatus.OutForDelivery:
                playbookType = "MonitorOnly";
                confidence = 0.67d;
                actions.Add(new AiSuggestedAction(
                    AiActionKind.NoAction,
                    null,
                    "AI playbook: keep monitoring and escalate only if no delivery event in 30 minutes.",
                    "NoAction"));
                break;

            case ShipmentStatus.DeliveryFailed:
                playbookType = "RetryRecovery";
                confidence = 0.79d;
                var nextRetryAtUtc = DateTime.UtcNow.AddHours(2);

                actions.Add(new AiSuggestedAction(
                    AiActionKind.SetRetryState,
                    null,
                    "AI playbook: schedule a retry attempt and mark exception workflow.",
                    $"RetryAtUtc={nextRetryAtUtc:O}",
                    HandoverState.Exception,
                    true,
                    1,
                    "AI recommended delivery retry",
                    nextRetryAtUtc));

                actions.Add(new AiSuggestedAction(
                    AiActionKind.UpdateStatus,
                    ShipmentStatus.OutForDelivery,
                    "AI playbook: move shipment back to OutForDelivery for retry dispatch.",
                    "OutForDelivery"));
                break;

            case ShipmentStatus.Delivered:
            case ShipmentStatus.Returned:
                playbookType = "CompletedNoAction";
                confidence = 0.98d;
                actions.Add(new AiSuggestedAction(
                    AiActionKind.NoAction,
                    null,
                    "Shipment is already completed. No action is required.",
                    "NoAction"));
                break;

            default:
                actions.Add(new AiSuggestedAction(
                    AiActionKind.NoAction,
                    null,
                    "No deterministic playbook action is available.",
                    "NoAction"));
                break;
        }

        explanationParts.Add($"Playbook {playbookType} was selected for role {requestedByRole}.");

        return new AiRecommendationState(
            Guid.NewGuid(),
            shipment.ShipmentId,
            playbookType,
            confidence,
            string.Join(" ", explanationParts),
            true,
            DateTime.UtcNow,
            actions);
    }

    private static ShipmentAiRecommendationDto MapAiRecommendation(AiRecommendationState recommendation)
    {
        var actions = recommendation.SuggestedActions
            .Select(MapAiAction)
            .ToList();

        return new ShipmentAiRecommendationDto(
            recommendation.RecommendationId,
            recommendation.ShipmentId,
            recommendation.PlaybookType,
            recommendation.ConfidenceScore,
            recommendation.ExplanationText,
            recommendation.RequiresHumanApproval,
            recommendation.CreatedAtUtc,
            actions);
    }

    private static ShipmentAiActionDto MapAiAction(AiSuggestedAction action)
    {
        return new ShipmentAiActionDto(
            ToActionTypeText(action.Kind),
            action.Description,
            action.ProposedValue);
    }

    private static string ToActionTypeText(AiActionKind value)
    {
        return value switch
        {
            AiActionKind.UpdateStatus => "update-status",
            AiActionKind.SetRetryState => "set-retry-state",
            _ => "no-action"
        };
    }

    private static bool IsDbUpdateConcurrencyException(Exception ex)
    {
        return string.Equals(ex.GetType().Name, "DbUpdateConcurrencyException", StringComparison.Ordinal);
    }

    private static bool RequiresVehicleForAgentStatus(ShipmentStatus status)
    {
        return status is ShipmentStatus.InTransit
            or ShipmentStatus.OutForDelivery
            or ShipmentStatus.Delivered;
    }

    private static string GenerateShipmentNumber()
    {
        var year = DateTime.UtcNow.Year;
        var suffix = Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
        return $"SHP-{year}-{suffix}";
    }

    private static ShipmentDto MapShipment(Shipment shipment)
    {
        var events = shipment.Events
            .OrderBy(x => x.CreatedAtUtc)
            .Select(e => new ShipmentEventDto(
                e.ShipmentEventId,
                e.Status,
                e.Note,
                e.UpdatedByUserId,
                e.UpdatedByRole,
                e.CreatedAtUtc))
            .ToList();

        return new ShipmentDto(
            shipment.ShipmentId,
            shipment.OrderId,
            shipment.DealerId,
            shipment.ShipmentNumber,
            shipment.DeliveryAddress,
            shipment.City,
            shipment.State,
            shipment.PostalCode,
            shipment.AssignedAgentId,
            shipment.VehicleNumber,
            shipment.AssignmentDecisionStatus,
            shipment.AssignmentDecisionReason,
            shipment.AssignmentDecisionAtUtc,
            shipment.DeliveryAgentRating,
            shipment.DeliveryAgentRatingComment,
            shipment.DeliveryAgentRatedAtUtc,
            shipment.DeliveryAgentRatedByUserId,
            shipment.Status,
            shipment.CreatedAtUtc,
            shipment.DeliveredAtUtc,
            events);
    }

    private async Task SyncOpsStateWithShipmentAsync(Shipment shipment, CancellationToken cancellationToken)
    {
        var state = await shipmentRepository.GetShipmentOpsStateAsync(shipment.ShipmentId, cancellationToken)
            ?? ShipmentOpsState.CreateDefault(shipment);

        state.SyncWithShipment(shipment);
        await shipmentRepository.UpsertShipmentOpsStateAsync(state, cancellationToken);
    }

    private static ShipmentOpsStateDto MapOpsState(ShipmentOpsState state)
    {
        return new ShipmentOpsStateDto(
            state.ShipmentId,
            ToHandoverStateText(state.HandoverState),
            state.HandoverExceptionReason,
            state.RetryRequired,
            state.RetryCount,
            state.RetryReason,
            state.NextRetryAtUtc,
            state.LastRetryScheduledAtUtc,
            state.UpdatedAtUtc);
    }

    private static HandoverState ParseHandoverState(string? value, HandoverState fallback)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "pending" => HandoverState.Pending,
            "ready" => HandoverState.Ready,
            "exception" => HandoverState.Exception,
            "completed" => HandoverState.Completed,
            _ => fallback
        };
    }

    private static string ToHandoverStateText(HandoverState value)
    {
        return value switch
        {
            HandoverState.Pending => "pending",
            HandoverState.Ready => "ready",
            HandoverState.Exception => "exception",
            HandoverState.Completed => "completed",
            _ => "pending"
        };
    }

    private static string? NormalizeText(string? value, int maxLength)
    {
        if (value is null)
        {
            return null;
        }

        var normalized = value.Trim();
        if (normalized.Length == 0)
        {
            return null;
        }

        if (normalized.Length <= maxLength)
        {
            return normalized;
        }

        return normalized[..maxLength];
    }

    private static DateTime? NormalizeOptionalUtc(DateTime? value)
    {
        if (value is null || value == default)
        {
            return null;
        }

        return value.Value.Kind == DateTimeKind.Utc ? value.Value : value.Value.ToUniversalTime();
    }
}
