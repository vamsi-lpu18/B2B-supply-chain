using BuildingBlocks.Persistence;
using Microsoft.EntityFrameworkCore;
using Order.Application.Abstractions;
using Order.Application.DTOs;
using Order.Domain.Enums;
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

    public async Task<IReadOnlyList<OrderAggregate>> GetOrdersByIdsAsync(IReadOnlyCollection<Guid> orderIds, CancellationToken cancellationToken)
    {
        if (orderIds.Count == 0)
        {
            return [];
        }

        return await dbContext.Orders
            .Include(x => x.StatusHistory)
            .Where(x => orderIds.Contains(x.OrderId))
            .ToListAsync(cancellationToken);
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

    public async Task<OrderAnalyticsDto> GetOrderAnalyticsAsync(DateTime fromUtc, int top, CancellationToken cancellationToken)
    {
        var safeTop = Math.Clamp(top, 3, 20);
        var toUtc = DateTime.UtcNow;

        var analyticsOrders = dbContext.Orders
            .AsNoTracking()
            .Where(order => order.PlacedAtUtc >= fromUtc && order.Status != OrderStatus.Cancelled);

        var summary = await analyticsOrders
            .GroupBy(_ => 1)
            .Select(group => new
            {
                TotalOrders = group.Count(),
                TotalRevenue = group.Sum(order => order.TotalAmount),
                UniqueDealers = group.Select(order => order.DealerId).Distinct().Count()
            })
            .FirstOrDefaultAsync(cancellationToken);

        var totalOrders = summary?.TotalOrders ?? 0;
        var totalRevenue = summary?.TotalRevenue ?? 0m;
        var uniqueDealers = summary?.UniqueDealers ?? 0;
        var averageOrderValue = totalOrders > 0
            ? decimal.Round(totalRevenue / totalOrders, 2)
            : 0m;

        var orderIds = analyticsOrders.Select(order => order.OrderId);

        var unitsSold = await dbContext.OrderLines
            .AsNoTracking()
            .Where(line => orderIds.Contains(line.OrderId))
            .SumAsync(line => (int?)line.Quantity, cancellationToken) ?? 0;

        var topDealers = await analyticsOrders
            .GroupBy(order => order.DealerId)
            .Select(group => new
            {
                DealerId = group.Key,
                OrderCount = group.Count(),
                TotalAmount = group.Sum(order => order.TotalAmount)
            })
            .OrderByDescending(item => item.TotalAmount)
            .ThenByDescending(item => item.OrderCount)
            .Take(safeTop)
            .Select(item => new DealerPurchaseStatDto(
                item.DealerId,
                item.OrderCount,
                item.TotalAmount))
            .ToListAsync(cancellationToken);

        var topProducts = await dbContext.OrderLines
            .AsNoTracking()
            .Where(line => orderIds.Contains(line.OrderId))
            .GroupBy(line => new { line.ProductId, line.ProductName, line.Sku })
            .Select(group => new
            {
                group.Key.ProductId,
                group.Key.ProductName,
                group.Key.Sku,
                UnitsSold = group.Sum(line => line.Quantity),
                Revenue = group.Sum(line => line.UnitPrice * line.Quantity)
            })
            .OrderByDescending(item => item.Revenue)
            .ThenByDescending(item => item.UnitsSold)
            .Take(safeTop)
            .Select(item => new ProductPurchaseStatDto(
                item.ProductId,
                item.ProductName,
                item.Sku,
                item.UnitsSold,
                item.Revenue))
            .ToListAsync(cancellationToken);

        var dailyRevenueRows = await analyticsOrders
            .GroupBy(order => order.PlacedAtUtc.Date)
            .Select(group => new
            {
                DayUtc = group.Key,
                OrderCount = group.Count(),
                Revenue = group.Sum(order => order.TotalAmount)
            })
            .OrderBy(point => point.DayUtc)
            .ToListAsync(cancellationToken);

        var dailyRevenue = dailyRevenueRows
            .Select(point => new DailyRevenuePointDto(point.DayUtc, point.OrderCount, point.Revenue))
            .ToList();

        return new OrderAnalyticsDto(
            fromUtc,
            toUtc,
            totalOrders,
            totalRevenue,
            averageOrderValue,
            uniqueDealers,
            unitsSold,
            topDealers,
            topProducts,
            dailyRevenue);
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
