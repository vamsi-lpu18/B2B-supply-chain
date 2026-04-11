using LogisticsTracking.Application.DTOs;
using LogisticsTracking.Domain.Entities;
using LogisticsTracking.Domain.Enums;

namespace LogisticsTracking.Application.Abstractions;

public interface ILogisticsService
{
    Task<ShipmentDto> CreateShipmentAsync(CreateShipmentRequest request, Guid createdByUserId, string createdByRole, CancellationToken cancellationToken);
    Task<ShipmentDto?> GetShipmentAsync(Guid shipmentId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ShipmentDto>> GetDealerShipmentsAsync(Guid dealerId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ShipmentDto>> GetAgentShipmentsAsync(Guid agentId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ShipmentDto>> GetAllShipmentsAsync(CancellationToken cancellationToken);
    Task<bool> AssignAgentAsync(Guid shipmentId, Guid agentId, Guid updatedByUserId, string updatedByRole, CancellationToken cancellationToken);
    Task<bool> AssignVehicleAsync(Guid shipmentId, string vehicleNumber, Guid updatedByUserId, string updatedByRole, CancellationToken cancellationToken);
    Task<bool> UpdateShipmentStatusAsync(Guid shipmentId, ShipmentStatus status, string note, Guid updatedByUserId, string updatedByRole, CancellationToken cancellationToken);
    Task<ShipmentOpsStateDto?> GetShipmentOpsStateAsync(Guid shipmentId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ShipmentOpsStateDto>> GetShipmentOpsStatesAsync(GetShipmentOpsStatesRequest request, CancellationToken cancellationToken);
    Task<ShipmentOpsStateDto?> UpsertShipmentOpsStateAsync(Guid shipmentId, UpsertShipmentOpsStateRequest request, CancellationToken cancellationToken);
    Task<ShipmentAiRecommendationDto?> GenerateAiRecommendationAsync(Guid shipmentId, Guid requestedByUserId, string requestedByRole, CancellationToken cancellationToken);
    Task<ApproveAiRecommendationResultDto?> ApproveAiRecommendationAsync(Guid recommendationId, Guid approvedByUserId, string approvedByRole, CancellationToken cancellationToken);
}

public sealed record ShipmentAiGenerationRequest(
    Guid ShipmentId,
    ShipmentStatus Status,
    Guid? AssignedAgentId,
    string? VehicleNumber,
    string RequestedByRole,
    DateTime RequestedAtUtc);

public sealed record ShipmentAiGeneratedAction(
    string ActionType,
    string Description,
    string ProposedValue,
    ShipmentStatus? Status,
    HandoverState? HandoverState,
    bool RetryRequired,
    int RetryCount,
    string? RetryReason,
    DateTime? NextRetryAtUtc);

public sealed record ShipmentAiGenerationResult(
    string PlaybookType,
    double ConfidenceScore,
    string ExplanationText,
    bool RequiresHumanApproval,
    IReadOnlyList<ShipmentAiGeneratedAction> SuggestedActions);

public interface IShipmentAiRecommendationProvider
{
    Task<ShipmentAiGenerationResult?> GenerateAsync(ShipmentAiGenerationRequest request, CancellationToken cancellationToken);
}

public interface IShipmentRepository
{
    Task AddShipmentAsync(Shipment shipment, CancellationToken cancellationToken);
    Task<Shipment?> GetShipmentByIdAsync(Guid shipmentId, CancellationToken cancellationToken);
    Task<IReadOnlyList<Shipment>> GetDealerShipmentsAsync(Guid dealerId, CancellationToken cancellationToken);
    Task<IReadOnlyList<Shipment>> GetAgentShipmentsAsync(Guid agentId, CancellationToken cancellationToken);
    Task<IReadOnlyList<Shipment>> GetAllShipmentsAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<Shipment>> GetShipmentsByIdsAsync(IReadOnlyCollection<Guid> shipmentIds, CancellationToken cancellationToken);
    Task<ShipmentOpsState?> GetShipmentOpsStateAsync(Guid shipmentId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ShipmentOpsState>> GetShipmentOpsStatesAsync(IReadOnlyCollection<Guid> shipmentIds, CancellationToken cancellationToken);
    Task UpsertShipmentOpsStateAsync(ShipmentOpsState state, CancellationToken cancellationToken);
    Task AddOutboxMessageAsync(string eventType, object payload, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
