using BuildingBlocks.Persistence;
using LogisticsTracking.Application.Abstractions;
using LogisticsTracking.Domain.Entities;
using LogisticsTracking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace LogisticsTracking.Infrastructure.Repositories;

internal sealed class ShipmentRepository(LogisticsTrackingDbContext dbContext) : IShipmentRepository
{
    public async Task AddShipmentAsync(Shipment shipment, CancellationToken cancellationToken)
    {
        await dbContext.Shipments.AddAsync(shipment, cancellationToken);
    }

    public Task<Shipment?> GetShipmentByIdAsync(Guid shipmentId, CancellationToken cancellationToken)
    {
        return dbContext.Shipments
            .Include(x => x.Events)
            .FirstOrDefaultAsync(x => x.ShipmentId == shipmentId, cancellationToken);
    }

    public async Task<IReadOnlyList<Shipment>> GetDealerShipmentsAsync(Guid dealerId, CancellationToken cancellationToken)
    {
        var shipments = await dbContext.Shipments
            .AsNoTracking()
            .Include(x => x.Events)
            .Where(x => x.DealerId == dealerId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return shipments;
    }

    public async Task<IReadOnlyList<Shipment>> GetAgentShipmentsAsync(Guid agentId, CancellationToken cancellationToken)
    {
        var shipments = await dbContext.Shipments
            .AsNoTracking()
            .Include(x => x.Events)
            .Where(x => x.AssignedAgentId == agentId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return shipments;
    }

    public async Task<IReadOnlyList<Shipment>> GetAllShipmentsAsync(CancellationToken cancellationToken)
    {
        var shipments = await dbContext.Shipments
            .AsNoTracking()
            .Include(x => x.Events)
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return shipments;
    }

    public async Task<IReadOnlyList<Shipment>> GetShipmentsByIdsAsync(IReadOnlyCollection<Guid> shipmentIds, CancellationToken cancellationToken)
    {
        if (shipmentIds.Count == 0)
        {
            return [];
        }

        var shipments = await dbContext.Shipments
            .AsNoTracking()
            .Where(x => shipmentIds.Contains(x.ShipmentId))
            .ToListAsync(cancellationToken);

        return shipments;
    }

    public Task<ShipmentOpsState?> GetShipmentOpsStateAsync(Guid shipmentId, CancellationToken cancellationToken)
    {
        return dbContext.ShipmentOpsStates
            .FirstOrDefaultAsync(x => x.ShipmentId == shipmentId, cancellationToken);
    }

    public async Task<IReadOnlyList<ShipmentOpsState>> GetShipmentOpsStatesAsync(IReadOnlyCollection<Guid> shipmentIds, CancellationToken cancellationToken)
    {
        if (shipmentIds.Count == 0)
        {
            return [];
        }

        var states = await dbContext.ShipmentOpsStates
            .AsNoTracking()
            .Where(x => shipmentIds.Contains(x.ShipmentId))
            .ToListAsync(cancellationToken);

        return states;
    }

    public async Task UpsertShipmentOpsStateAsync(ShipmentOpsState state, CancellationToken cancellationToken)
    {
        var existing = await dbContext.ShipmentOpsStates
            .FirstOrDefaultAsync(x => x.ShipmentId == state.ShipmentId, cancellationToken);

        if (existing is null)
        {
            await dbContext.ShipmentOpsStates.AddAsync(state, cancellationToken);
        }
        else if (!ReferenceEquals(existing, state))
        {
            dbContext.Entry(existing).CurrentValues.SetValues(state);
        }
    }

    public async Task AddOutboxMessageAsync(string eventType, object payload, CancellationToken cancellationToken)
    {
        var outbox = new OutboxMessage
        {
            MessageId = Guid.NewGuid(),
            EventType = eventType,
            Payload = JsonSerializer.Serialize(payload),
            Status = OutboxStatus.Pending,
            CreatedAtUtc = DateTime.UtcNow
        };

        await dbContext.OutboxMessages.AddAsync(outbox, cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        return dbContext.SaveChangesAsync(cancellationToken);
    }
}
