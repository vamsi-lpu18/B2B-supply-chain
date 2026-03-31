using BuildingBlocks.Persistence;
using Microsoft.EntityFrameworkCore;
using Order.Application.Abstractions;
using Order.Domain.Entities;
using Order.Infrastructure.Persistence;
using System.Text.Json;

namespace Order.Infrastructure.Repositories;

internal sealed class OrderRepository(OrderDbContext dbContext) : IOrderRepository
{
    public async Task AddOrderAsync(OrderAggregate order, CancellationToken cancellationToken)
    {
        await dbContext.Orders.AddAsync(order, cancellationToken);
    }

    public Task<OrderAggregate?> GetOrderByIdAsync(Guid orderId, CancellationToken cancellationToken)
    {
        return dbContext.Orders
            .Include(x => x.Lines)
            .Include(x => x.StatusHistory)
            .Include(x => x.ReturnRequest)
            .FirstOrDefaultAsync(x => x.OrderId == orderId, cancellationToken);
    }

    public async Task<(IReadOnlyList<OrderAggregate> Items, int TotalCount)> GetDealerOrdersAsync(
        Guid dealerId,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        var query = dbContext.Orders
            .AsNoTracking()
            .Where(x => x.DealerId == dealerId)
            .OrderByDescending(x => x.PlacedAtUtc);

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }

    public async Task<(IReadOnlyList<OrderAggregate> Items, int TotalCount)> GetAllOrdersAsync(int page, int pageSize, int? status, CancellationToken cancellationToken)
    {
        var baseQuery = dbContext.Orders.AsNoTracking().AsQueryable();

        if (status.HasValue && Enum.IsDefined(typeof(Order.Domain.Enums.OrderStatus), status.Value))
        {
            var statusEnum = (Order.Domain.Enums.OrderStatus)status.Value;
            baseQuery = baseQuery.Where(x => x.Status == statusEnum);
        }

        var query = baseQuery.OrderByDescending(x => x.PlacedAtUtc);

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (items, totalCount);
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
