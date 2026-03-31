using CatalogInventory.Application.DTOs;
using CatalogInventory.Domain.Entities;

namespace CatalogInventory.Application.Abstractions;

public interface ICatalogInventoryService
{
    Task<IReadOnlyList<CategoryDto>> GetCategoriesAsync(CancellationToken cancellationToken);
    Task<ProductDto> CreateProductAsync(CreateProductRequest request, CancellationToken cancellationToken);
    Task<ProductDto?> UpdateProductAsync(Guid productId, UpdateProductRequest request, CancellationToken cancellationToken);
    Task<bool> DeactivateProductAsync(Guid productId, CancellationToken cancellationToken);
    Task<bool> RestockProductAsync(Guid productId, RestockProductRequest request, CancellationToken cancellationToken);
    Task<PagedResult<ProductListItemDto>> GetProductListAsync(int page, int size, CancellationToken cancellationToken);
    Task<ProductDto?> GetProductDetailAsync(Guid productId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ProductListItemDto>> SearchProductsAsync(string query, CancellationToken cancellationToken);
    Task<StockLevelDto?> GetStockLevelAsync(Guid productId, CancellationToken cancellationToken);
    Task<bool> SoftLockStockAsync(SoftLockStockRequest request, CancellationToken cancellationToken);
    Task<bool> HardDeductStockAsync(HardDeductStockRequest request, CancellationToken cancellationToken);
    Task<bool> ReleaseSoftLockAsync(ReleaseSoftLockRequest request, CancellationToken cancellationToken);
    Task<bool> SubscribeStockAsync(StockSubscriptionRequest request, CancellationToken cancellationToken);
    Task<bool> UnsubscribeStockAsync(StockSubscriptionRequest request, CancellationToken cancellationToken);
}

public interface IProductRepository
{
    Task AddProductAsync(Product product, CancellationToken cancellationToken);
    Task<IReadOnlyList<Category>> GetCategoriesAsync(CancellationToken cancellationToken);
    Task<bool> CategoryExistsAsync(Guid categoryId, CancellationToken cancellationToken);
    Task<Product?> GetProductByIdAsync(Guid productId, CancellationToken cancellationToken);
    Task<Product?> GetProductBySkuAsync(string sku, CancellationToken cancellationToken);
    Task<(IReadOnlyList<Product> Items, int TotalCount)> GetProductPageAsync(int page, int size, CancellationToken cancellationToken);
    Task<IReadOnlyList<Product>> SearchProductsAsync(string query, CancellationToken cancellationToken);
    Task AddStockTransactionAsync(StockTransaction transaction, CancellationToken cancellationToken);
    Task<bool> StockSubscriptionExistsAsync(Guid dealerId, Guid productId, CancellationToken cancellationToken);
    Task AddStockSubscriptionAsync(StockSubscription subscription, CancellationToken cancellationToken);
    Task<bool> RemoveStockSubscriptionAsync(Guid dealerId, Guid productId, CancellationToken cancellationToken);
    Task AddOutboxMessageAsync(string eventType, object payload, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}

public interface IInventoryCacheStore
{
    Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default);
    Task SetAsync<T>(string key, T value, TimeSpan ttl, CancellationToken cancellationToken = default);
    Task DeleteAsync(string key, CancellationToken cancellationToken = default);
    Task<bool> SetIfNotExistsAsync(string key, int value, TimeSpan ttl, CancellationToken cancellationToken = default);
    Task<int?> GetIntAsync(string key, CancellationToken cancellationToken = default);
    Task AddTrackedKeyAsync(string trackerKey, string key, CancellationToken cancellationToken = default);
    Task InvalidateTrackedKeysAsync(string trackerKey, CancellationToken cancellationToken = default);
}
