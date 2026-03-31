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

    public async Task<IReadOnlyList<Shipment>> GetAllShipmentsAsync(CancellationToken cancellationToken)
    {
        var shipments = await dbContext.Shipments
            .AsNoTracking()
            .Include(x => x.Events)
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return shipments;
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
