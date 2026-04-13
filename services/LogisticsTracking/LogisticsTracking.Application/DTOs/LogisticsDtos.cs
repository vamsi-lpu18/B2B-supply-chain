using LogisticsTracking.Domain.Enums;

namespace LogisticsTracking.Application.DTOs;

public sealed record CreateShipmentRequest(
    Guid OrderId,
    Guid DealerId,
    string DeliveryAddress,
    string City,
    string State,
    string PostalCode);

public sealed record AssignAgentRequest(Guid AgentId);

public sealed record AssignVehicleRequest(string VehicleNumber);

public sealed record RejectAssignmentRequest(string Reason);

public sealed record RateDeliveryAgentRequest(int Rating, string? Comment);

public sealed record UpdateShipmentStatusRequest(ShipmentStatus Status, string Note);

public sealed record ShipmentEventDto(
    Guid ShipmentEventId,
    ShipmentStatus Status,
    string Note,
    Guid UpdatedByUserId,
    string UpdatedByRole,
    DateTime CreatedAtUtc);

public sealed record ShipmentDto(
    Guid ShipmentId,
    Guid OrderId,
    Guid DealerId,
    string ShipmentNumber,
    string DeliveryAddress,
    string City,
    string State,
    string PostalCode,
    Guid? AssignedAgentId,
    string? VehicleNumber,
    AssignmentDecisionStatus AssignmentDecisionStatus,
    string? AssignmentDecisionReason,
    DateTime? AssignmentDecisionAtUtc,
    int? DeliveryAgentRating,
    string? DeliveryAgentRatingComment,
    DateTime? DeliveryAgentRatedAtUtc,
    Guid? DeliveryAgentRatedByUserId,
    ShipmentStatus Status,
    DateTime CreatedAtUtc,
    DateTime? DeliveredAtUtc,
    IReadOnlyList<ShipmentEventDto> Events);

public sealed record GetShipmentOpsStatesRequest(IReadOnlyList<Guid> ShipmentIds);

public sealed record UpsertShipmentOpsStateRequest(
    string? HandoverState,
    string? HandoverExceptionReason,
    bool? RetryRequired,
    int? RetryCount,
    string? RetryReason,
    DateTime? NextRetryAtUtc,
    DateTime? LastRetryScheduledAtUtc);

public sealed record ShipmentOpsStateDto(
    Guid ShipmentId,
    string HandoverState,
    string? HandoverExceptionReason,
    bool RetryRequired,
    int RetryCount,
    string? RetryReason,
    DateTime? NextRetryAtUtc,
    DateTime? LastRetryScheduledAtUtc,
    DateTime UpdatedAtUtc);

public sealed record ShipmentAiActionDto(
    string ActionType,
    string Description,
    string ProposedValue);

public sealed record ShipmentAiRecommendationDto(
    Guid RecommendationId,
    Guid ShipmentId,
    string PlaybookType,
    double ConfidenceScore,
    string ExplanationText,
    bool RequiresHumanApproval,
    DateTime CreatedAtUtc,
    IReadOnlyList<ShipmentAiActionDto> SuggestedActions);

public sealed record AiRecommendationExecutionStepDto(
    string ActionType,
    string Result,
    string Message);

public sealed record ApproveAiRecommendationResultDto(
    Guid RecommendationId,
    Guid ShipmentId,
    bool Executed,
    DateTime ApprovedAtUtc,
    IReadOnlyList<AiRecommendationExecutionStepDto> Steps,
    ShipmentDto Shipment);
