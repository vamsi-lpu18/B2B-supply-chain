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
    ShipmentStatus Status,
    DateTime CreatedAtUtc,
    DateTime? DeliveredAtUtc,
    IReadOnlyList<ShipmentEventDto> Events);
