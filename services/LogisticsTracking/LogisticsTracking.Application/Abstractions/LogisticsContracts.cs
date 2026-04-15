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
    Task<bool> AcceptAssignmentAsync(Guid shipmentId, Guid agentId, Guid updatedByUserId, string updatedByRole, CancellationToken cancellationToken);
    Task<bool> RejectAssignmentAsync(Guid shipmentId, Guid agentId, string reason, Guid updatedByUserId, string updatedByRole, CancellationToken cancellationToken);
    Task<bool> RateDeliveryAgentAsync(Guid shipmentId, int rating, string? comment, Guid ratedByUserId, string ratedByRole, CancellationToken cancellationToken);
    Task<bool> AssignVehicleAsync(Guid shipmentId, string vehicleNumber, Guid updatedByUserId, string updatedByRole, CancellationToken cancellationToken);
    Task<bool> UpdateShipmentStatusAsync(Guid shipmentId, ShipmentStatus status, string note, Guid updatedByUserId, string updatedByRole, CancellationToken cancellationToken);
    Task<ShipmentOpsStateDto?> GetShipmentOpsStateAsync(Guid shipmentId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ShipmentOpsStateDto>> GetShipmentOpsStatesAsync(GetShipmentOpsStatesRequest request, CancellationToken cancellationToken);
    Task<ShipmentOpsStateDto?> UpsertShipmentOpsStateAsync(Guid shipmentId, UpsertShipmentOpsStateRequest request, CancellationToken cancellationToken);
    Task<LogisticsChatbotResponseDto> AskChatbotAsync(LogisticsChatbotRequest request, Guid userId, string userRole, CancellationToken cancellationToken);
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

public interface ILogisticsChatLlmClient
{
    bool IsEnabled { get; }
    Task<string?> GenerateReplyAsync(string userRole, string userQuestion, string operationsContext, CancellationToken cancellationToken);
}
