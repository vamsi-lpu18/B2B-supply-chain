namespace CatalogInventory.Application.DTOs;

public sealed record CreateProductRequest(
    string Sku,
    string Name,
    string Description,
    Guid CategoryId,
    decimal UnitPrice,
    int MinOrderQty,
    int OpeningStock,
    string? ImageUrl);

public sealed record UpdateProductRequest(
    string Name,
    string Description,
    Guid CategoryId,
    decimal UnitPrice,
    int MinOrderQty,
    string? ImageUrl,
    bool IsActive);

public sealed record RestockProductRequest(int Quantity, string ReferenceId);

public sealed record SoftLockStockRequest(Guid ProductId, Guid OrderId, int Quantity);

public sealed record HardDeductStockRequest(Guid ProductId, Guid OrderId, int Quantity);

public sealed record ReleaseSoftLockRequest(Guid ProductId, Guid OrderId);

public sealed record StockSubscriptionRequest(Guid DealerId, Guid ProductId);

public sealed record ProductDto(
    Guid ProductId,
    string Sku,
    string Name,
    string Description,
    Guid CategoryId,
    decimal UnitPrice,
    int MinOrderQty,
    int TotalStock,
    int ReservedStock,
    int AvailableStock,
    bool IsActive,
    string? ImageUrl,
    DateTime UpdatedAtUtc);

public sealed record CreateProductReviewRequest(
    int Rating,
    string Title,
    string Comment);

public sealed record ModerateProductReviewRequest(string? Note);

public sealed record ProductReviewDto(
    Guid ReviewId,
    Guid ProductId,
    Guid DealerId,
    int Rating,
    string Title,
    string Comment,
    bool IsApproved,
    bool IsRejected,
    string? ModerationNote,
    DateTime CreatedAtUtc,
    DateTime? ModeratedAtUtc,
    Guid? ModeratedByUserId);

public sealed record ProductListItemDto(
    Guid ProductId,
    string Sku,
    string Name,
    Guid CategoryId,
    decimal UnitPrice,
    int AvailableStock,
    bool IsActive,
    string? ImageUrl);

public sealed record CategoryDto(
    Guid CategoryId,
    string Name,
    Guid? ParentCategoryId);

public sealed record StockLevelDto(Guid ProductId, int TotalStock, int ReservedStock, int AvailableStock);

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int TotalCount, int Page, int PageSize);
