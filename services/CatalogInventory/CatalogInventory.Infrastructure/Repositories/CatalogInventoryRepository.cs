using BuildingBlocks.Persistence;
using CatalogInventory.Application.Abstractions;
using CatalogInventory.Domain.Entities;
using CatalogInventory.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace CatalogInventory.Infrastructure.Repositories;

internal sealed class CatalogInventoryRepository(CatalogInventoryDbContext dbContext) : IProductRepository
{
    public async Task AddProductAsync(Product product, CancellationToken cancellationToken)
    {
        await dbContext.Products.AddAsync(product, cancellationToken);
    }

    public async Task<IReadOnlyList<Category>> GetCategoriesAsync(CancellationToken cancellationToken)
    {
        return await dbContext.Categories
            .AsNoTracking()
            .OrderBy(c => c.Name)
            .ToListAsync(cancellationToken);
    }

    public Task<bool> CategoryExistsAsync(Guid categoryId, CancellationToken cancellationToken)
    {
        return dbContext.Categories.AnyAsync(c => c.CategoryId == categoryId, cancellationToken);
    }

    public Task<Product?> GetProductByIdAsync(Guid productId, CancellationToken cancellationToken)
    {
        return dbContext.Products.FirstOrDefaultAsync(p => p.ProductId == productId, cancellationToken);
    }

    public Task<Product?> GetProductBySkuAsync(string sku, CancellationToken cancellationToken)
    {
        var normalizedSku = sku.Trim().ToUpperInvariant();
        return dbContext.Products.FirstOrDefaultAsync(p => p.Sku == normalizedSku, cancellationToken);
    }

    public async Task<(IReadOnlyList<Product> Items, int TotalCount)> GetProductPageAsync(int page, int size, CancellationToken cancellationToken)
    {
        var query = dbContext.Products
            .AsNoTracking()
            .Where(p => p.IsActive)
            .OrderBy(p => p.Name);

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }

    public async Task<IReadOnlyList<Product>> SearchProductsAsync(string query, CancellationToken cancellationToken)
    {
        var normalized = query.Trim();

        var items = await dbContext.Products
            .AsNoTracking()
            .Where(p => p.IsActive && (p.Name.Contains(normalized) || p.Sku.Contains(normalized)))
            .OrderBy(p => p.Name)
            .Take(100)
            .ToListAsync(cancellationToken);

        return items;
    }

    public async Task AddStockTransactionAsync(StockTransaction transaction, CancellationToken cancellationToken)
    {
        await dbContext.StockTransactions.AddAsync(transaction, cancellationToken);
    }

    public Task<bool> StockSubscriptionExistsAsync(Guid dealerId, Guid productId, CancellationToken cancellationToken)
    {
        return dbContext.StockSubscriptions.AnyAsync(
            x => x.DealerId == dealerId && x.ProductId == productId,
            cancellationToken);
    }

    public async Task AddStockSubscriptionAsync(StockSubscription subscription, CancellationToken cancellationToken)
    {
        await dbContext.StockSubscriptions.AddAsync(subscription, cancellationToken);
    }

    public async Task<bool> RemoveStockSubscriptionAsync(Guid dealerId, Guid productId, CancellationToken cancellationToken)
    {
        var subscription = await dbContext.StockSubscriptions
            .FirstOrDefaultAsync(
                x => x.DealerId == dealerId && x.ProductId == productId,
                cancellationToken);

        if (subscription is null)
        {
            return false;
        }

        dbContext.StockSubscriptions.Remove(subscription);
        await dbContext.SaveChangesAsync(cancellationToken);

        return true;
    }

    public async Task AddOutboxMessageAsync(string eventType, object payload, CancellationToken cancellationToken)
    {
        var outboxMessage = new OutboxMessage
        {
            MessageId = Guid.NewGuid(),
            EventType = eventType,
            Payload = JsonSerializer.Serialize(payload),
            Status = OutboxStatus.Pending,
            CreatedAtUtc = DateTime.UtcNow
        };

        await dbContext.OutboxMessages.AddAsync(outboxMessage, cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        return dbContext.SaveChangesAsync(cancellationToken);
    }
}
