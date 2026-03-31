using LogisticsTracking.Application.DTOs;
using LogisticsTracking.Domain.Entities;
using LogisticsTracking.Domain.Enums;

namespace LogisticsTracking.Application.Abstractions;

public interface ILogisticsService
{
    Task<ShipmentDto> CreateShipmentAsync(CreateShipmentRequest request, Guid createdByUserId, string createdByRole, CancellationToken cancellationToken);
    Task<ShipmentDto?> GetShipmentAsync(Guid shipmentId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ShipmentDto>> GetDealerShipmentsAsync(Guid dealerId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ShipmentDto>> GetAllShipmentsAsync(CancellationToken cancellationToken);
    Task<bool> AssignAgentAsync(Guid shipmentId, Guid agentId, Guid updatedByUserId, string updatedByRole, CancellationToken cancellationToken);
    Task<bool> AssignVehicleAsync(Guid shipmentId, string vehicleNumber, Guid updatedByUserId, string updatedByRole, CancellationToken cancellationToken);
    Task<bool> UpdateShipmentStatusAsync(Guid shipmentId, ShipmentStatus status, string note, Guid updatedByUserId, string updatedByRole, CancellationToken cancellationToken);
}

public interface IShipmentRepository
{
    Task AddShipmentAsync(Shipment shipment, CancellationToken cancellationToken);
    Task<Shipment?> GetShipmentByIdAsync(Guid shipmentId, CancellationToken cancellationToken);
    Task<IReadOnlyList<Shipment>> GetDealerShipmentsAsync(Guid dealerId, CancellationToken cancellationToken);
    Task<IReadOnlyList<Shipment>> GetAllShipmentsAsync(CancellationToken cancellationToken);
    Task AddOutboxMessageAsync(string eventType, object payload, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
