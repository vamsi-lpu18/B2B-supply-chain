using FluentValidation;
using LogisticsTracking.Application.Abstractions;
using LogisticsTracking.Application.DTOs;
using LogisticsTracking.Domain.Entities;
using LogisticsTracking.Domain.Enums;

namespace LogisticsTracking.Application.Services;

public sealed class LogisticsService(
    IShipmentRepository shipmentRepository,
    ILogisticsChatLlmClient llmClient,
    IValidator<CreateShipmentRequest> createValidator,
    IValidator<AssignAgentRequest> assignValidator,
    IValidator<RejectAssignmentRequest> rejectAssignmentValidator,
    IValidator<RateDeliveryAgentRequest> rateDeliveryAgentValidator,
    IValidator<AssignVehicleRequest> assignVehicleValidator,
    IValidator<UpdateShipmentStatusRequest> statusValidator)
    : ILogisticsService
{
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

    public async Task<LogisticsChatbotResponseDto> AskChatbotAsync(LogisticsChatbotRequest request, Guid userId, string userRole, CancellationToken cancellationToken)
    {
        var prompt = NormalizeText(request.Message, 500);
        if (string.IsNullOrWhiteSpace(prompt))
        {
            return new LogisticsChatbotResponseDto(
                "validation",
                "Enter a question so I can help with shipment operations.",
                [],
                BuildSuggestedPrompts(),
                DateTime.UtcNow);
        }

        var shipments = await GetRoleScopedShipmentsAsync(userId, userRole, cancellationToken);
        if (shipments.Count == 0)
        {
            return new LogisticsChatbotResponseDto(
                "no-data",
                "No shipments are currently available in your scope.",
                [],
                BuildSuggestedPrompts(),
                DateTime.UtcNow);
        }

        var liveLlmResponse = await TryBuildLiveLlmResponseAsync(prompt, userRole, shipments, cancellationToken);
        if (liveLlmResponse is not null)
        {
            return liveLlmResponse;
        }

        var normalizedPrompt = prompt.ToLowerInvariant();

        if (ContainsAny(normalizedPrompt, "help", "what can you do", "capability", "how to use"))
        {
            return BuildHelpResponse(shipments);
        }

        var matchedShipment = shipments.FirstOrDefault(shipment =>
            normalizedPrompt.Contains(shipment.ShipmentNumber.ToLowerInvariant(), StringComparison.Ordinal)
            || normalizedPrompt.Contains(shipment.ShipmentId.ToString("N"), StringComparison.Ordinal)
            || normalizedPrompt.Contains(shipment.ShipmentId.ToString(), StringComparison.Ordinal));

        if (matchedShipment is not null)
        {
            return await BuildShipmentInsightResponseAsync(matchedShipment, cancellationToken);
        }

        var mentionedStatuses = DetectMentionedStatuses(normalizedPrompt);
        var timeWindow = ParseTimeWindow(normalizedPrompt);
        if (mentionedStatuses.Count > 0
            || timeWindow != QueryTimeWindow.None
            || ContainsAny(normalizedPrompt, "status of", "shipment status", "where is my shipment", "where is shipment"))
        {
            return BuildStatusQueryResponse(shipments, mentionedStatuses, timeWindow, normalizedPrompt);
        }

        if (ContainsAny(normalizedPrompt, "delay", "delayed", "failed", "running late", "late shipment", "late delivery", "risk"))
        {
            return BuildDelayResponse(shipments);
        }

        if (ContainsAny(normalizedPrompt, "retry", "handover", "exception"))
        {
            return await BuildRetryResponseAsync(shipments, cancellationToken);
        }

        if (ContainsAny(normalizedPrompt, "delivered", "completed", "done"))
        {
            return BuildDeliveredResponse(shipments);
        }

        if (ContainsAny(normalizedPrompt, "unassigned", "without agent", "assign", "agent", "vehicle"))
        {
            return BuildAssignmentResponse(shipments);
        }

        if (ContainsAny(normalizedPrompt, "in transit", "out for delivery", "picked up", "active delivery"))
        {
            return BuildTransitResponse(shipments);
        }

        return await BuildConversationalResponseAsync(prompt, normalizedPrompt, shipments, cancellationToken);
    }

    private async Task<IReadOnlyList<Shipment>> GetRoleScopedShipmentsAsync(Guid userId, string userRole, CancellationToken cancellationToken)
    {
        if (string.Equals(userRole, "Dealer", StringComparison.OrdinalIgnoreCase) && userId != Guid.Empty)
        {
            return await shipmentRepository.GetDealerShipmentsAsync(userId, cancellationToken);
        }

        if (string.Equals(userRole, "Agent", StringComparison.OrdinalIgnoreCase) && userId != Guid.Empty)
        {
            return await shipmentRepository.GetAgentShipmentsAsync(userId, cancellationToken);
        }

        if (string.Equals(userRole, "Admin", StringComparison.OrdinalIgnoreCase)
            || string.Equals(userRole, "Logistics", StringComparison.OrdinalIgnoreCase)
            || string.Equals(userRole, "Warehouse", StringComparison.OrdinalIgnoreCase))
        {
            return await shipmentRepository.GetAllShipmentsAsync(cancellationToken);
        }

        return [];
    }

    private LogisticsChatbotResponseDto BuildStatusSummaryResponse(IReadOnlyList<Shipment> shipments)
    {
        var grouped = shipments
            .GroupBy(shipment => shipment.Status)
            .OrderByDescending(group => group.Count())
            .ToList();
        var failedCount = shipments.Count(shipment => shipment.Status == ShipmentStatus.DeliveryFailed);
        var assignmentGapCount = shipments.Count(shipment => !shipment.AssignedAgentId.HasValue || string.IsNullOrWhiteSpace(shipment.VehicleNumber));

        var summary = grouped.Select(group => $"{group.Key}: {group.Count()}");
        var recent = shipments
            .OrderByDescending(shipment => shipment.CreatedAtUtc)
            .Take(3)
            .Select(BuildSource)
            .ToList();
        var nextAction = failedCount > 0
            ? "review failed shipments and retry worklist first"
            : "focus on active deliveries and assignment gaps";

        return new LogisticsChatbotResponseDto(
            "status-summary",
            $"Current shipment distribution: {string.Join(", ", summary)}. Assignment gaps: {assignmentGapCount}. Next action: {nextAction}.",
            recent,
            BuildSuggestedPrompts(),
            DateTime.UtcNow);
    }

    private LogisticsChatbotResponseDto BuildHelpResponse(IReadOnlyList<Shipment> shipments)
    {
        var total = shipments.Count;
        var active = shipments.Count(shipment => shipment.Status is ShipmentStatus.InTransit or ShipmentStatus.OutForDelivery);
        var failed = shipments.Count(shipment => shipment.Status == ShipmentStatus.DeliveryFailed);
        var delivered = shipments.Count(shipment => shipment.Status == ShipmentStatus.Delivered);
        var gaps = shipments.Count(shipment => !shipment.AssignedAgentId.HasValue || string.IsNullOrWhiteSpace(shipment.VehicleNumber));

        var reply =
            "I can summarize shipment status, flag delays, list retry exceptions, inspect a shipment by number, "
            + $"and show assignment gaps. In your scope: {total} total, {active} active, {failed} failed, {delivered} delivered, {gaps} assignment gap(s).";

        var recent = shipments
            .OrderByDescending(shipment => shipment.CreatedAtUtc)
            .Take(3)
            .Select(BuildSource)
            .ToList();

        return new LogisticsChatbotResponseDto(
            "help",
            reply,
            recent,
            BuildSuggestedPrompts(),
            DateTime.UtcNow);
    }

    private LogisticsChatbotResponseDto BuildDelayResponse(IReadOnlyList<Shipment> shipments)
    {
        var failed = shipments
            .Where(shipment => shipment.Status == ShipmentStatus.DeliveryFailed)
            .OrderByDescending(shipment => shipment.CreatedAtUtc)
            .ToList();

        var active = shipments.Count(shipment => shipment.Status is ShipmentStatus.InTransit or ShipmentStatus.OutForDelivery);
        var sources = failed.Take(5).Select(BuildSource).ToList();
        var reply = failed.Count == 0
            ? $"No failed shipments right now. Active deliveries to monitor: {active}. Next action: check assignment and transit health."
            : $"Found {failed.Count} failed shipment(s). Active deliveries to monitor: {active}. Next action: review retry queue and resolve handover exceptions.";

        return new LogisticsChatbotResponseDto(
            "delay-monitor",
            reply,
            sources,
            BuildSuggestedPrompts(),
            DateTime.UtcNow);
    }

    private async Task<LogisticsChatbotResponseDto> BuildRetryResponseAsync(IReadOnlyList<Shipment> shipments, CancellationToken cancellationToken)
    {
        var shipmentIds = shipments.Select(shipment => shipment.ShipmentId).ToArray();
        var states = await shipmentRepository.GetShipmentOpsStatesAsync(shipmentIds, cancellationToken);
        var stateByShipmentId = states.ToDictionary(state => state.ShipmentId);

        var candidates = shipments
            .Where(shipment => stateByShipmentId.TryGetValue(shipment.ShipmentId, out var state)
                && (state.RetryRequired || state.HandoverState == HandoverState.Exception))
            .OrderByDescending(shipment => shipment.CreatedAtUtc)
            .Take(5)
            .ToList();

        var sources = candidates
            .Select(shipment =>
            {
                var state = stateByShipmentId[shipment.ShipmentId];
                var retryText = state.NextRetryAtUtc.HasValue
                    ? state.NextRetryAtUtc.Value.ToString("yyyy-MM-dd HH:mm")
                    : "not scheduled";
                return new LogisticsChatbotSourceDto(
                    "shipment-ops",
                    shipment.ShipmentNumber,
                    $"State={state.HandoverState}; RetryRequired={state.RetryRequired}; NextRetry={retryText}");
            })
            .ToList();

        var reply = candidates.Count == 0
            ? "No shipments currently require retry workflow intervention."
            : $"{candidates.Count} shipment(s) need retry or handover exception handling. Next action: prioritize entries with Exception state or unscheduled next retry.";

        return new LogisticsChatbotResponseDto(
            "retry-worklist",
            reply,
            sources,
            BuildSuggestedPrompts(),
            DateTime.UtcNow);
    }

    private LogisticsChatbotResponseDto BuildDeliveredResponse(IReadOnlyList<Shipment> shipments)
    {
        var delivered = shipments
            .Where(shipment => shipment.Status == ShipmentStatus.Delivered)
            .OrderByDescending(shipment => shipment.DeliveredAtUtc ?? shipment.CreatedAtUtc)
            .ToList();

        var recent = delivered
            .Take(5)
            .Select(shipment => new LogisticsChatbotSourceDto(
                "shipment",
                shipment.ShipmentNumber,
                $"DeliveredAt={shipment.DeliveredAtUtc:yyyy-MM-dd HH:mm}"))
            .ToList();
        var pending = shipments.Count - delivered.Count;

        return new LogisticsChatbotResponseDto(
            "delivery-summary",
            $"Delivered shipments in scope: {delivered.Count}. Remaining non-delivered shipments: {pending}.",
            recent,
            BuildSuggestedPrompts(),
            DateTime.UtcNow);
    }

    private LogisticsChatbotResponseDto BuildAssignmentResponse(IReadOnlyList<Shipment> shipments)
    {
        var missingAgentCount = shipments.Count(shipment => !shipment.AssignedAgentId.HasValue);
        var missingVehicleCount = shipments.Count(shipment => string.IsNullOrWhiteSpace(shipment.VehicleNumber));

        var sources = shipments
            .Where(shipment => !shipment.AssignedAgentId.HasValue || string.IsNullOrWhiteSpace(shipment.VehicleNumber))
            .OrderByDescending(shipment => shipment.CreatedAtUtc)
            .Take(5)
            .Select(shipment => new LogisticsChatbotSourceDto(
                "shipment-assignment",
                shipment.ShipmentNumber,
                $"Agent={(shipment.AssignedAgentId.HasValue ? "assigned" : "missing")}; Vehicle={(string.IsNullOrWhiteSpace(shipment.VehicleNumber) ? "missing" : "assigned")}; Status={shipment.Status}"))
            .ToList();

        var reply = missingAgentCount == 0 && missingVehicleCount == 0
            ? "All shipments in your scope have both agent and vehicle assignments."
            : $"Assignment gaps found: {missingAgentCount} shipment(s) missing agents, {missingVehicleCount} shipment(s) missing vehicles. Next action: complete assignments before moving shipments to InTransit.";

        return new LogisticsChatbotResponseDto(
            "assignment-overview",
            reply,
            sources,
            BuildSuggestedPrompts(),
            DateTime.UtcNow);
    }

    private LogisticsChatbotResponseDto BuildTransitResponse(IReadOnlyList<Shipment> shipments)
    {
        var active = shipments
            .Where(shipment => shipment.Status is ShipmentStatus.InTransit or ShipmentStatus.OutForDelivery)
            .OrderByDescending(shipment => shipment.CreatedAtUtc)
            .Take(5)
            .ToList();

        var sources = active
            .Select(shipment => new LogisticsChatbotSourceDto(
                "shipment-transit",
                shipment.ShipmentNumber,
                $"Status={shipment.Status}; Vehicle={(string.IsNullOrWhiteSpace(shipment.VehicleNumber) ? "unassigned" : shipment.VehicleNumber)}"))
            .ToList();

        var inTransitCount = shipments.Count(shipment => shipment.Status == ShipmentStatus.InTransit);
        var outForDeliveryCount = shipments.Count(shipment => shipment.Status == ShipmentStatus.OutForDelivery);

        var reply = active.Count == 0
            ? "No active deliveries are currently in transit or out for delivery."
            : $"Active delivery view: {inTransitCount} in transit and {outForDeliveryCount} out for delivery. Next action: prioritize out-for-delivery completions and check any unassigned vehicle.";

        return new LogisticsChatbotResponseDto(
            "active-deliveries",
            reply,
            sources,
            BuildSuggestedPrompts(),
            DateTime.UtcNow);
    }

    private LogisticsChatbotResponseDto BuildStatusQueryResponse(
        IReadOnlyList<Shipment> shipments,
        IReadOnlyList<ShipmentStatus> mentionedStatuses,
        QueryTimeWindow timeWindow,
        string normalizedPrompt)
    {
        var statusFilter = mentionedStatuses.Count == 0
            ? Enum.GetValues<ShipmentStatus>()
            : [.. mentionedStatuses];

        var matching = shipments
            .Where(shipment => statusFilter.Contains(shipment.Status))
            .Where(shipment => IsWithinTimeWindow(shipment, timeWindow))
            .OrderByDescending(ResolveReferenceTimeUtc)
            .ToList();

        var timeScopeLabel = timeWindow switch
        {
            QueryTimeWindow.Today => " for today",
            QueryTimeWindow.Yesterday => " for yesterday",
            QueryTimeWindow.Last7Days => " in the last 7 days",
            _ => string.Empty
        };

        if (matching.Count == 0)
        {
            return new LogisticsChatbotResponseDto(
                "status-query",
                $"No shipments matched your status/time filter{timeScopeLabel}. Try removing the date filter or asking for a broader status summary.",
                [],
                BuildSuggestedPrompts(),
                DateTime.UtcNow);
        }

        var grouped = matching
            .GroupBy(shipment => shipment.Status)
            .OrderByDescending(group => group.Count())
            .Select(group => $"{group.Key}: {group.Count()}")
            .ToArray();

        var sources = matching
            .Take(5)
            .Select(shipment => new LogisticsChatbotSourceDto(
                "shipment-status",
                shipment.ShipmentNumber,
                $"Status={shipment.Status}; UpdatedView={ResolveReferenceTimeUtc(shipment):yyyy-MM-dd HH:mm}"))
            .ToList();

        var isCountQuery = ContainsAny(normalizedPrompt, "how many", "count", "number", "total");
        var isListQuery = ContainsAny(normalizedPrompt, "list", "show", "which", "details", "give me");

        var reply = isCountQuery
            ? $"Matching shipments{timeScopeLabel}: {matching.Count}. Breakdown: {string.Join(", ", grouped)}."
            : isListQuery
                ? $"Found {matching.Count} matching shipment(s){timeScopeLabel}. Showing the latest {sources.Count} entries below."
                : $"I interpreted your question as a status lookup and found {matching.Count} shipment(s){timeScopeLabel}. Breakdown: {string.Join(", ", grouped)}.";

        return new LogisticsChatbotResponseDto(
            "status-query",
            reply,
            sources,
            BuildSuggestedPrompts(),
            DateTime.UtcNow);
    }

    private async Task<LogisticsChatbotResponseDto> BuildConversationalResponseAsync(
        string prompt,
        string normalizedPrompt,
        IReadOnlyList<Shipment> shipments,
        CancellationToken cancellationToken)
    {
        var shipmentIds = shipments.Select(shipment => shipment.ShipmentId).ToArray();
        var opsStates = await shipmentRepository.GetShipmentOpsStatesAsync(shipmentIds, cancellationToken);
        var stateByShipmentId = opsStates.ToDictionary(state => state.ShipmentId);
        var tokens = ExtractSearchTokens(normalizedPrompt);

        var ranked = shipments
            .Select(shipment =>
            {
                stateByShipmentId.TryGetValue(shipment.ShipmentId, out var opsState);
                var score = CalculateRelevanceScore(shipment, opsState, normalizedPrompt, tokens);
                return new
                {
                    Shipment = shipment,
                    OpsState = opsState,
                    Score = score
                };
            })
            .OrderByDescending(item => item.Score)
            .ThenByDescending(item => ResolveReferenceTimeUtc(item.Shipment))
            .ToList();

        var topMatches = ranked
            .Where(item => item.Score > 0)
            .Take(5)
            .ToList();

        if (topMatches.Count == 0)
        {
            var summary = BuildStatusSummaryResponse(shipments);
            var compactPrompt = prompt.Length <= 90 ? prompt : $"{prompt[..90]}...";
            return new LogisticsChatbotResponseDto(
                "contextual-summary",
                $"I do not have a direct match for \"{compactPrompt}\" in your shipment data, so here is the nearest operations snapshot: {summary.Reply}",
                summary.Sources,
                summary.SuggestedPrompts,
                DateTime.UtcNow);
        }

        var matchingShipments = topMatches
            .Select(item => item.Shipment)
            .ToList();

        var grouped = matchingShipments
            .GroupBy(shipment => shipment.Status)
            .OrderByDescending(group => group.Count())
            .Select(group => $"{group.Key}: {group.Count()}")
            .ToArray();

        var sources = topMatches
            .Select(item => BuildConversationalSource(item.Shipment, item.OpsState))
            .ToList();

        var isCountQuery = ContainsAny(normalizedPrompt, "how many", "count", "number", "total");
        var asksNextAction = ContainsAny(normalizedPrompt, "next", "what should", "priority", "prioritize", "action");

        var failedCount = matchingShipments.Count(shipment => shipment.Status == ShipmentStatus.DeliveryFailed);
        var missingAgentCount = matchingShipments.Count(shipment => !shipment.AssignedAgentId.HasValue);
        var missingVehicleCount = matchingShipments.Count(shipment => string.IsNullOrWhiteSpace(shipment.VehicleNumber));
        var retryCount = topMatches.Count(item => item.OpsState?.RetryRequired == true || item.OpsState?.HandoverState == HandoverState.Exception);

        var nextAction = retryCount > 0
            ? "prioritize retry-required and handover-exception shipments first"
            : missingAgentCount > 0 || missingVehicleCount > 0
                ? "close assignment gaps (agent/vehicle) before dispatch progression"
                : failedCount > 0
                    ? "review failed shipments and capture recovery notes"
                    : "monitor in-transit and out-for-delivery progression";

        var reply = isCountQuery
            ? $"I found {matchingShipments.Count} relevant shipment(s) for your question. Breakdown: {string.Join(", ", grouped)}."
            : $"Here is the most relevant view from your shipment data: {string.Join(", ", grouped)}.";

        if (asksNextAction || !isCountQuery)
        {
            reply = $"{reply} Next action: {nextAction}.";
        }

        return new LogisticsChatbotResponseDto(
            "llm-lite",
            reply,
            sources,
            BuildSuggestedPrompts(),
            DateTime.UtcNow);
    }

    private async Task<LogisticsChatbotResponseDto?> TryBuildLiveLlmResponseAsync(
        string prompt,
        string userRole,
        IReadOnlyList<Shipment> shipments,
        CancellationToken cancellationToken)
    {
        if (!llmClient.IsEnabled)
        {
            return null;
        }

        var shipmentIds = shipments.Select(shipment => shipment.ShipmentId).ToArray();
        var states = await shipmentRepository.GetShipmentOpsStatesAsync(shipmentIds, cancellationToken);
        var stateByShipmentId = states.ToDictionary(state => state.ShipmentId);

        var operationsContext = BuildLlmOperationsContext(userRole, shipments, stateByShipmentId);
        var llmReply = await llmClient.GenerateReplyAsync(userRole, prompt, operationsContext, cancellationToken);
        if (string.IsNullOrWhiteSpace(llmReply))
        {
            return null;
        }

        var sources = shipments
            .OrderByDescending(ResolveReferenceTimeUtc)
            .Take(5)
            .Select(shipment => stateByShipmentId.TryGetValue(shipment.ShipmentId, out var state)
                ? BuildConversationalSource(shipment, state)
                : BuildSource(shipment))
            .ToList();

        return new LogisticsChatbotResponseDto(
            "llm-live",
            llmReply,
            sources,
            BuildSuggestedPrompts(),
            DateTime.UtcNow);
    }

    private static string BuildLlmOperationsContext(
        string userRole,
        IReadOnlyList<Shipment> shipments,
        IReadOnlyDictionary<Guid, ShipmentOpsState> stateByShipmentId)
    {
        var statusSummary = shipments
            .GroupBy(shipment => shipment.Status)
            .OrderByDescending(group => group.Count())
            .Select(group => $"{group.Key}:{group.Count()}")
            .ToArray();

        var failedCount = shipments.Count(shipment => shipment.Status == ShipmentStatus.DeliveryFailed);
        var assignmentGapCount = shipments.Count(shipment => !shipment.AssignedAgentId.HasValue || string.IsNullOrWhiteSpace(shipment.VehicleNumber));
        var retryOrExceptionCount = stateByShipmentId.Values.Count(state => state.RetryRequired || state.HandoverState == HandoverState.Exception);

        var recentLines = shipments
            .OrderByDescending(ResolveReferenceTimeUtc)
            .Take(12)
            .Select(shipment =>
            {
                stateByShipmentId.TryGetValue(shipment.ShipmentId, out var state);
                var handover = state?.HandoverState.ToString() ?? "Unknown";
                var retry = state is not null && state.RetryRequired
                    ? $"Yes({state.RetryCount})"
                    : "No";
                var agent = shipment.AssignedAgentId.HasValue ? "assigned" : "missing";
                var vehicle = string.IsNullOrWhiteSpace(shipment.VehicleNumber) ? "missing" : shipment.VehicleNumber;

                return $"{shipment.ShipmentNumber} | Status={shipment.Status} | Agent={agent} | Vehicle={vehicle} | Handover={handover} | Retry={retry}";
            })
            .ToArray();

        return string.Join('\n',
            $"UserRole: {userRole}",
            $"TotalShipments: {shipments.Count}",
            $"StatusSummary: {string.Join(", ", statusSummary)}",
            $"DeliveryFailedCount: {failedCount}",
            $"AssignmentGapCount: {assignmentGapCount}",
            $"RetryOrExceptionCount: {retryOrExceptionCount}",
            "RecentShipments:",
            string.Join('\n', recentLines));
    }

    private async Task<LogisticsChatbotResponseDto> BuildShipmentInsightResponseAsync(Shipment shipment, CancellationToken cancellationToken)
    {
        var opsState = await shipmentRepository.GetShipmentOpsStateAsync(shipment.ShipmentId, cancellationToken);
        var retryLabel = opsState?.RetryRequired == true
            ? $"Retry required (count={opsState.RetryCount})."
            : "Retry not required.";
        var handoverLabel = opsState is null
            ? "Handover state unavailable."
            : $"Handover={opsState.HandoverState}.";

        var agentLabel = shipment.AssignedAgentId.HasValue
            ? shipment.AssignedAgentId.Value.ToString()
            : "Unassigned";
        var vehicleLabel = string.IsNullOrWhiteSpace(shipment.VehicleNumber)
            ? "Unassigned"
            : shipment.VehicleNumber;
        var nextAction = shipment.Status switch
        {
            ShipmentStatus.Created when !shipment.AssignedAgentId.HasValue => "Next action: assign an agent.",
            ShipmentStatus.Assigned when string.IsNullOrWhiteSpace(shipment.VehicleNumber) => "Next action: assign a vehicle.",
            ShipmentStatus.DeliveryFailed => "Next action: inspect retry and handover exception details.",
            ShipmentStatus.OutForDelivery => "Next action: confirm delivery completion or failure reason.",
            ShipmentStatus.Delivered => "Next action: no shipment action required.",
            _ => "Next action: monitor status progression."
        };

        return new LogisticsChatbotResponseDto(
            "shipment-insight",
            $"{shipment.ShipmentNumber} is {shipment.Status}. Agent: {agentLabel}. Vehicle: {vehicleLabel}. {handoverLabel} {retryLabel} {nextAction}",
            [BuildSource(shipment)],
            BuildSuggestedPrompts(),
            DateTime.UtcNow);
    }

    private static LogisticsChatbotSourceDto BuildSource(Shipment shipment)
    {
        return new LogisticsChatbotSourceDto(
            "shipment",
            shipment.ShipmentNumber,
            $"Status={shipment.Status}; CreatedAt={shipment.CreatedAtUtc:yyyy-MM-dd HH:mm}");
    }

    private static LogisticsChatbotSourceDto BuildConversationalSource(Shipment shipment, ShipmentOpsState? opsState)
    {
        var agentLabel = shipment.AssignedAgentId.HasValue ? "assigned" : "missing";
        var vehicleLabel = string.IsNullOrWhiteSpace(shipment.VehicleNumber) ? "missing" : shipment.VehicleNumber;
        var handoverLabel = opsState is null ? "unknown" : opsState.HandoverState.ToString();
        var retryLabel = opsState is null
            ? "unknown"
            : opsState.RetryRequired
                ? $"required({opsState.RetryCount})"
                : "not-required";

        return new LogisticsChatbotSourceDto(
            "shipment-context",
            shipment.ShipmentNumber,
            $"Status={shipment.Status}; Agent={agentLabel}; Vehicle={vehicleLabel}; Handover={handoverLabel}; Retry={retryLabel}");
    }

    private static int CalculateRelevanceScore(
        Shipment shipment,
        ShipmentOpsState? opsState,
        string normalizedPrompt,
        IReadOnlyList<string> tokens)
    {
        var score = 0;

        if (normalizedPrompt.Contains(shipment.ShipmentNumber.ToLowerInvariant(), StringComparison.Ordinal))
        {
            score += 30;
        }

        if (ContainsAny(normalizedPrompt, shipment.Status.ToString().ToLowerInvariant()))
        {
            score += 6;
        }

        if (ContainsAny(normalizedPrompt, "retry", "handover", "exception")
            && opsState is not null
            && (opsState.RetryRequired || opsState.HandoverState == HandoverState.Exception))
        {
            score += 10;
        }

        if (ContainsAny(normalizedPrompt, "agent", "assignment") && !shipment.AssignedAgentId.HasValue)
        {
            score += 7;
        }

        if (ContainsAny(normalizedPrompt, "vehicle") && string.IsNullOrWhiteSpace(shipment.VehicleNumber))
        {
            score += 7;
        }

        if (ContainsAny(normalizedPrompt, "active", "in transit", "out for delivery")
            && shipment.Status is ShipmentStatus.InTransit or ShipmentStatus.OutForDelivery)
        {
            score += 8;
        }

        if (ContainsAny(normalizedPrompt, "shipment", "shipments", "delivery", "deliveries", "ops", "operations"))
        {
            score += 2;
        }

        if (ContainsAny(normalizedPrompt, "block", "blocking", "issue", "problem", "stuck"))
        {
            if (shipment.Status == ShipmentStatus.DeliveryFailed)
            {
                score += 8;
            }

            if (!shipment.AssignedAgentId.HasValue || string.IsNullOrWhiteSpace(shipment.VehicleNumber))
            {
                score += 6;
            }

            if (opsState?.RetryRequired == true || opsState?.HandoverState == HandoverState.Exception)
            {
                score += 8;
            }
        }

        var searchable = string.Join(' ',
            shipment.ShipmentNumber,
            shipment.Status,
            shipment.VehicleNumber ?? "",
            opsState?.HandoverState.ToString() ?? string.Empty,
            opsState?.RetryReason ?? string.Empty,
            opsState?.HandoverExceptionReason ?? string.Empty).ToLowerInvariant();

        foreach (var token in tokens)
        {
            if (searchable.Contains(token, StringComparison.Ordinal))
            {
                score += 2;
            }
        }

        return score;
    }

    private static IReadOnlyList<string> ExtractSearchTokens(string normalizedPrompt)
    {
        var sanitizedChars = normalizedPrompt
            .Select(character => char.IsLetterOrDigit(character) ? character : ' ')
            .ToArray();
        var sanitized = new string(sanitizedChars);

        return sanitized
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(token => token.Length >= 3 && !_promptStopWords.Contains(token))
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }

    private static IReadOnlyList<ShipmentStatus> DetectMentionedStatuses(string normalizedPrompt)
    {
        var statuses = new List<ShipmentStatus>();

        if (ContainsAny(normalizedPrompt, "out for delivery", "out-for-delivery", "ofd"))
        {
            statuses.Add(ShipmentStatus.OutForDelivery);
        }

        if (ContainsAny(normalizedPrompt, "in transit", "in-transit", "transit", "on the way"))
        {
            statuses.Add(ShipmentStatus.InTransit);
        }

        if (ContainsAny(normalizedPrompt, "delivery failed", "failed", "delayed", "delay", "running late", "late shipment", "late delivery", "risk"))
        {
            statuses.Add(ShipmentStatus.DeliveryFailed);
        }

        if (ContainsAny(normalizedPrompt, "delivered", "completed", "done"))
        {
            statuses.Add(ShipmentStatus.Delivered);
        }

        if (ContainsAny(normalizedPrompt, "status assigned", "assigned status", "assigned shipments", "shipments assigned", "assignment accepted"))
        {
            statuses.Add(ShipmentStatus.Assigned);
        }

        if (ContainsAny(normalizedPrompt, "created", "new shipment", "new shipments"))
        {
            statuses.Add(ShipmentStatus.Created);
        }

        if (ContainsAny(normalizedPrompt, "active delivery", "active deliveries"))
        {
            statuses.Add(ShipmentStatus.InTransit);
            statuses.Add(ShipmentStatus.OutForDelivery);
        }

        return statuses
            .Distinct()
            .ToList();
    }

    private static QueryTimeWindow ParseTimeWindow(string normalizedPrompt)
    {
        if (ContainsAny(normalizedPrompt, "today", "todays", "this day"))
        {
            return QueryTimeWindow.Today;
        }

        if (ContainsAny(normalizedPrompt, "yesterday"))
        {
            return QueryTimeWindow.Yesterday;
        }

        if (ContainsAny(normalizedPrompt, "last 7 days", "past 7 days", "this week", "last week"))
        {
            return QueryTimeWindow.Last7Days;
        }

        return QueryTimeWindow.None;
    }

    private static bool IsWithinTimeWindow(Shipment shipment, QueryTimeWindow timeWindow)
    {
        if (timeWindow == QueryTimeWindow.None)
        {
            return true;
        }

        var referenceUtc = ResolveReferenceTimeUtc(shipment);
        var todayUtc = DateTime.UtcNow.Date;

        return timeWindow switch
        {
            QueryTimeWindow.Today => referenceUtc.Date == todayUtc,
            QueryTimeWindow.Yesterday => referenceUtc.Date == todayUtc.AddDays(-1),
            QueryTimeWindow.Last7Days => referenceUtc >= todayUtc.AddDays(-6),
            _ => true
        };
    }

    private static DateTime ResolveReferenceTimeUtc(Shipment shipment)
    {
        return shipment.DeliveredAtUtc ?? shipment.CreatedAtUtc;
    }

    private static bool ContainsAny(string text, params string[] tokens)
    {
        return tokens.Any(token => text.Contains(token, StringComparison.Ordinal));
    }

    private static readonly HashSet<string> _promptStopWords = new(StringComparer.Ordinal)
    {
        "the",
        "and",
        "for",
        "with",
        "from",
        "into",
        "that",
        "this",
        "what",
        "when",
        "where",
        "which",
        "who",
        "how",
        "many",
        "your",
        "my",
        "our",
        "show",
        "list",
        "give",
        "tell",
        "about",
        "current",
        "please",
        "there",
        "have",
        "does",
        "need",
        "needed"
    };

    private enum QueryTimeWindow
    {
        None,
        Today,
        Yesterday,
        Last7Days
    }

    private static IReadOnlyList<string> BuildSuggestedPrompts()
    {
        return
        [
            "What can you help me with?",
            "Give me a shipment status summary.",
            "What is blocking deliveries right now?",
            "Show failed or delayed shipments.",
            "Which shipments need retry handling?",
            "Show assignment gaps (missing agent/vehicle).",
            "How many active deliveries are in transit right now?",
            "What should I prioritize next in logistics ops?"
        ];
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
