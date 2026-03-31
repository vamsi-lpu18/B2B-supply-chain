using FluentValidation;
using LogisticsTracking.Application.Abstractions;
using LogisticsTracking.Application.DTOs;
using LogisticsTracking.Domain.Entities;
using LogisticsTracking.Domain.Enums;

namespace LogisticsTracking.Application.Services;

public sealed class LogisticsService(
    IShipmentRepository shipmentRepository,
    IValidator<CreateShipmentRequest> createValidator,
    IValidator<AssignAgentRequest> assignValidator,
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

        await shipmentRepository.AddOutboxMessageAsync("ShipmentAssigned", new
        {
            shipment.ShipmentId,
            shipment.OrderId,
            shipment.DealerId,
            shipment.AssignedAgentId,
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

        shipment.UpdateStatus(status, note, updatedByUserId, updatedByRole);

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

    private static bool IsDbUpdateConcurrencyException(Exception ex)
    {
        return string.Equals(ex.GetType().Name, "DbUpdateConcurrencyException", StringComparison.Ordinal);
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
            shipment.Status,
            shipment.CreatedAtUtc,
            shipment.DeliveredAtUtc,
            events);
    }
}
