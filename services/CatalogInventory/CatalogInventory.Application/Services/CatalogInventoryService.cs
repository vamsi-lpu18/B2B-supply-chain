using CatalogInventory.Application.Abstractions;
using CatalogInventory.Application.DTOs;
using CatalogInventory.Domain.Entities;
using CatalogInventory.Domain.Enums;
using FluentValidation;
using System.Security.Cryptography;
using System.Text;

namespace CatalogInventory.Application.Services;

public sealed class CatalogInventoryService(
    IProductRepository productRepository,
    IInventoryCacheStore cacheStore,
    IValidator<CreateProductRequest> createValidator,
    IValidator<UpdateProductRequest> updateValidator,
    IValidator<RestockProductRequest> restockValidator,
    IValidator<SoftLockStockRequest> softLockValidator,
    IValidator<HardDeductStockRequest> hardDeductValidator,
    IValidator<StockSubscriptionRequest> stockSubscriptionValidator)
    : ICatalogInventoryService
{
    private static readonly TimeSpan ProductListTtl = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan ProductDetailTtl = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan SearchTtl = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan AvailableStockTtl = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan SoftLockTtl = TimeSpan.FromMinutes(30);

    private const string ProductPageTrackerKey = "catalog:products:keys";
    private const string SearchTrackerKey = "catalog:search:keys";

    public async Task<IReadOnlyList<CategoryDto>> GetCategoriesAsync(CancellationToken cancellationToken)
    {
        var categories = await productRepository.GetCategoriesAsync(cancellationToken);
        return categories.Select(ToCategoryDto).ToList();
    }

    public async Task<ProductDto> CreateProductAsync(CreateProductRequest request, CancellationToken cancellationToken)
    {
        await createValidator.ValidateAndThrowAsync(request, cancellationToken);

        var categoryExists = await productRepository.CategoryExistsAsync(request.CategoryId, cancellationToken);
        if (!categoryExists)
        {
            throw new InvalidOperationException("Category does not exist.");
        }

        var existing = await productRepository.GetProductBySkuAsync(request.Sku, cancellationToken);
        if (existing is not null)
        {
            throw new InvalidOperationException("SKU already exists.");
        }

        var product = Product.Create(
            request.Sku,
            request.Name,
            request.Description,
            request.CategoryId,
            request.UnitPrice,
            request.MinOrderQty,
            request.OpeningStock,
            request.ImageUrl);

        await productRepository.AddProductAsync(product, cancellationToken);
        await productRepository.AddOutboxMessageAsync("ProductCreated", new
        {
            product.ProductId,
            product.Sku,
            product.Name,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        try
        {
            await productRepository.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex) when (IsCategoryForeignKeyViolation(ex))
        {
            throw new InvalidOperationException("Category does not exist.");
        }
        await InvalidateProductReadCachesAsync(product.ProductId, cancellationToken);

        return ToProductDto(product);
    }

    public async Task<ProductDto?> UpdateProductAsync(Guid productId, UpdateProductRequest request, CancellationToken cancellationToken)
    {
        await updateValidator.ValidateAndThrowAsync(request, cancellationToken);

        var categoryExists = await productRepository.CategoryExistsAsync(request.CategoryId, cancellationToken);
        if (!categoryExists)
        {
            throw new InvalidOperationException("Category does not exist.");
        }

        var product = await productRepository.GetProductByIdAsync(productId, cancellationToken);
        if (product is null)
        {
            return null;
        }

        product.Update(
            request.Name,
            request.Description,
            request.CategoryId,
            request.UnitPrice,
            request.MinOrderQty,
            request.ImageUrl,
            request.IsActive);

        await productRepository.AddOutboxMessageAsync("ProductUpdated", new
        {
            product.ProductId,
            product.Sku,
            product.Name,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        try
        {
            await productRepository.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex) when (IsCategoryForeignKeyViolation(ex))
        {
            throw new InvalidOperationException("Category does not exist.");
        }
        await InvalidateProductReadCachesAsync(product.ProductId, cancellationToken);

        return ToProductDto(product);
    }

    private static bool IsCategoryForeignKeyViolation(Exception ex)
    {
        return ex.ToString().Contains("FK_Products_Categories_CategoryId", StringComparison.OrdinalIgnoreCase);
    }

    private static CategoryDto ToCategoryDto(Category category)
    {
        return new CategoryDto(
            category.CategoryId,
            category.Name,
            category.ParentCategoryId);
    }

    public async Task<bool> DeactivateProductAsync(Guid productId, CancellationToken cancellationToken)
    {
        var product = await productRepository.GetProductByIdAsync(productId, cancellationToken);
        if (product is null)
        {
            return false;
        }

        product.Deactivate();

        await productRepository.AddOutboxMessageAsync("ProductDeactivated", new
        {
            product.ProductId,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        await productRepository.SaveChangesAsync(cancellationToken);
        await InvalidateProductReadCachesAsync(product.ProductId, cancellationToken);

        return true;
    }

    public async Task<bool> RestockProductAsync(Guid productId, RestockProductRequest request, CancellationToken cancellationToken)
    {
        await restockValidator.ValidateAndThrowAsync(request, cancellationToken);

        var product = await productRepository.GetProductByIdAsync(productId, cancellationToken);
        if (product is null)
        {
            return false;
        }

        product.Restock(request.Quantity);

        await productRepository.AddStockTransactionAsync(
            StockTransaction.Create(product.ProductId, StockTransactionType.Restock, request.Quantity, request.ReferenceId),
            cancellationToken);

        await productRepository.AddOutboxMessageAsync("StockRestored", new
        {
            product.ProductId,
            quantity = request.Quantity,
            referenceId = request.ReferenceId,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        await productRepository.SaveChangesAsync(cancellationToken);

        await cacheStore.SetAsync(GetAvailableStockKey(product.ProductId), product.AvailableStock, AvailableStockTtl, cancellationToken);
        await InvalidateProductReadCachesAsync(product.ProductId, cancellationToken);

        return true;
    }

    public async Task<PagedResult<ProductListItemDto>> GetProductListAsync(int page, int size, bool includeInactive, CancellationToken cancellationToken)
    {
        page = page <= 0 ? 1 : page;
        size = size <= 0 ? 20 : Math.Min(size, 100);

        var cacheKey = GetProductPageKey(page, size, includeInactive);
        var cached = await cacheStore.GetAsync<PagedResult<ProductListItemDto>>(cacheKey, cancellationToken);
        if (cached is not null)
        {
            return cached;
        }

        var (items, totalCount) = await productRepository.GetProductPageAsync(page, size, includeInactive, cancellationToken);
        var mapped = items.Select(ToProductListItemDto).ToList();

        var result = new PagedResult<ProductListItemDto>(mapped, totalCount, page, size);

        await cacheStore.SetAsync(cacheKey, result, ProductListTtl, cancellationToken);
        await cacheStore.AddTrackedKeyAsync(ProductPageTrackerKey, cacheKey, cancellationToken);

        return result;
    }

    public async Task<ProductDto?> GetProductDetailAsync(Guid productId, CancellationToken cancellationToken)
    {
        var cacheKey = GetProductDetailKey(productId);
        var cached = await cacheStore.GetAsync<ProductDto>(cacheKey, cancellationToken);
        if (cached is not null)
        {
            return cached;
        }

        var product = await productRepository.GetProductByIdAsync(productId, cancellationToken);
        if (product is null)
        {
            return null;
        }

        var dto = ToProductDto(product);
        await cacheStore.SetAsync(cacheKey, dto, ProductDetailTtl, cancellationToken);

        return dto;
    }

    public async Task<IReadOnlyList<ProductListItemDto>> SearchProductsAsync(string query, bool includeInactive, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return [];
        }

        var queryHash = ComputeHash(query.Trim().ToLowerInvariant());
        var cacheKey = GetSearchKey(queryHash, includeInactive);

        var cached = await cacheStore.GetAsync<IReadOnlyList<ProductListItemDto>>(cacheKey, cancellationToken);
        if (cached is not null)
        {
            return cached;
        }

        var results = await productRepository.SearchProductsAsync(query, includeInactive, cancellationToken);
        var mapped = results.Select(ToProductListItemDto).ToList();

        await cacheStore.SetAsync(cacheKey, mapped, SearchTtl, cancellationToken);
        await cacheStore.AddTrackedKeyAsync(SearchTrackerKey, cacheKey, cancellationToken);

        return mapped;
    }

    public async Task<StockLevelDto?> GetStockLevelAsync(Guid productId, CancellationToken cancellationToken)
    {
        var product = await productRepository.GetProductByIdAsync(productId, cancellationToken);
        if (product is null)
        {
            return null;
        }

        return new StockLevelDto(product.ProductId, product.TotalStock, product.ReservedStock, product.AvailableStock);
    }

    public async Task<bool> SoftLockStockAsync(SoftLockStockRequest request, CancellationToken cancellationToken)
    {
        await softLockValidator.ValidateAndThrowAsync(request, cancellationToken);

        var product = await productRepository.GetProductByIdAsync(request.ProductId, cancellationToken);
        if (product is null || !product.IsActive)
        {
            return false;
        }

        if (product.AvailableStock < request.Quantity)
        {
            return false;
        }

        var lockKey = GetSoftLockKey(request.ProductId, request.OrderId);
        var acquired = await cacheStore.SetIfNotExistsAsync(lockKey, request.Quantity, SoftLockTtl, cancellationToken);
        if (!acquired)
        {
            return false;
        }

        await productRepository.AddStockTransactionAsync(
            StockTransaction.Create(request.ProductId, StockTransactionType.SoftLock, request.Quantity, request.OrderId.ToString("N")),
            cancellationToken);

        await productRepository.AddOutboxMessageAsync("StockSoftLocked", new
        {
            request.ProductId,
            request.OrderId,
            request.Quantity,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        await productRepository.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> HardDeductStockAsync(HardDeductStockRequest request, CancellationToken cancellationToken)
    {
        await hardDeductValidator.ValidateAndThrowAsync(request, cancellationToken);

        var lockKey = GetSoftLockKey(request.ProductId, request.OrderId);
        var softLockQty = await cacheStore.GetIntAsync(lockKey, cancellationToken);
        if (!softLockQty.HasValue || softLockQty.Value < request.Quantity)
        {
            return false;
        }

        var product = await productRepository.GetProductByIdAsync(request.ProductId, cancellationToken);
        if (product is null)
        {
            return false;
        }

        product.HardDeduct(request.Quantity);

        await productRepository.AddStockTransactionAsync(
            StockTransaction.Create(request.ProductId, StockTransactionType.HardDeduct, request.Quantity, request.OrderId.ToString("N")),
            cancellationToken);

        await productRepository.AddOutboxMessageAsync("StockDeducted", new
        {
            request.ProductId,
            request.OrderId,
            request.Quantity,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        await productRepository.SaveChangesAsync(cancellationToken);

        await cacheStore.DeleteAsync(lockKey, cancellationToken);
        await cacheStore.SetAsync(GetAvailableStockKey(product.ProductId), product.AvailableStock, AvailableStockTtl, cancellationToken);
        await InvalidateProductReadCachesAsync(product.ProductId, cancellationToken);

        return true;
    }

    public async Task<bool> ReleaseSoftLockAsync(ReleaseSoftLockRequest request, CancellationToken cancellationToken)
    {
        var lockKey = GetSoftLockKey(request.ProductId, request.OrderId);
        await cacheStore.DeleteAsync(lockKey, cancellationToken);

        await productRepository.AddStockTransactionAsync(
            StockTransaction.Create(request.ProductId, StockTransactionType.ReleaseReserve, 0, request.OrderId.ToString("N")),
            cancellationToken);

        await productRepository.AddOutboxMessageAsync("StockSoftLockReleased", new
        {
            request.ProductId,
            request.OrderId,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        await productRepository.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> SubscribeStockAsync(StockSubscriptionRequest request, CancellationToken cancellationToken)
    {
        await stockSubscriptionValidator.ValidateAndThrowAsync(request, cancellationToken);

        var exists = await productRepository.StockSubscriptionExistsAsync(request.DealerId, request.ProductId, cancellationToken);
        if (exists)
        {
            return true;
        }

        await productRepository.AddStockSubscriptionAsync(StockSubscription.Create(request.DealerId, request.ProductId), cancellationToken);
        await productRepository.SaveChangesAsync(cancellationToken);

        return true;
    }

    public Task<bool> UnsubscribeStockAsync(StockSubscriptionRequest request, CancellationToken cancellationToken)
    {
        return productRepository.RemoveStockSubscriptionAsync(request.DealerId, request.ProductId, cancellationToken);
    }

    private async Task InvalidateProductReadCachesAsync(Guid productId, CancellationToken cancellationToken)
    {
        await cacheStore.DeleteAsync(GetProductDetailKey(productId), cancellationToken);
        await cacheStore.DeleteAsync(GetAvailableStockKey(productId), cancellationToken);
        await cacheStore.InvalidateTrackedKeysAsync(ProductPageTrackerKey, cancellationToken);
        await cacheStore.InvalidateTrackedKeysAsync(SearchTrackerKey, cancellationToken);
    }

    private static ProductDto ToProductDto(Product product)
    {
        return new ProductDto(
            product.ProductId,
            product.Sku,
            product.Name,
            product.Description,
            product.CategoryId,
            product.UnitPrice,
            product.MinOrderQty,
            product.TotalStock,
            product.ReservedStock,
            product.AvailableStock,
            product.IsActive,
            product.ImageUrl,
            product.UpdatedAtUtc);
    }

    private static ProductListItemDto ToProductListItemDto(Product product)
    {
        return new ProductListItemDto(
            product.ProductId,
            product.Sku,
            product.Name,
            product.UnitPrice,
            product.AvailableStock,
            product.IsActive,
            product.ImageUrl);
    }

    private static string GetProductPageKey(int page, int size, bool includeInactive) =>
        $"catalog:products:page:{page}:size:{size}:includeInactive:{(includeInactive ? 1 : 0)}";
    private static string GetProductDetailKey(Guid productId) => $"catalog:product:{productId}";
    private static string GetSearchKey(string queryHash, bool includeInactive) =>
        $"catalog:search:{queryHash}:includeInactive:{(includeInactive ? 1 : 0)}";
    private static string GetSoftLockKey(Guid productId, Guid orderId) => $"inventory:softlock:{productId}:{orderId}";
    private static string GetAvailableStockKey(Guid productId) => $"inventory:available:{productId}";

    private static string ComputeHash(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
