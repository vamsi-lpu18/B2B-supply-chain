using CatalogInventory.Application.Abstractions;
using CatalogInventory.Application.DTOs;
using MediatR;

namespace CatalogInventory.Application.Features.Catalog;

public sealed record GetCategoriesQuery : IRequest<IReadOnlyList<CategoryDto>>;

public sealed class GetCategoriesQueryHandler(ICatalogInventoryService service)
    : IRequestHandler<GetCategoriesQuery, IReadOnlyList<CategoryDto>>
{
    public Task<IReadOnlyList<CategoryDto>> Handle(GetCategoriesQuery request, CancellationToken cancellationToken)
        => service.GetCategoriesAsync(cancellationToken);
}

public sealed record GetProductListQuery(int Page, int Size, bool IncludeInactive)
    : IRequest<PagedResult<ProductListItemDto>>;

public sealed class GetProductListQueryHandler(ICatalogInventoryService service)
    : IRequestHandler<GetProductListQuery, PagedResult<ProductListItemDto>>
{
    public Task<PagedResult<ProductListItemDto>> Handle(GetProductListQuery request, CancellationToken cancellationToken)
        => service.GetProductListAsync(request.Page, request.Size, request.IncludeInactive, cancellationToken);
}

public sealed record GetProductDetailQuery(Guid ProductId) : IRequest<ProductDto?>;

public sealed class GetProductDetailQueryHandler(ICatalogInventoryService service)
    : IRequestHandler<GetProductDetailQuery, ProductDto?>
{
    public Task<ProductDto?> Handle(GetProductDetailQuery request, CancellationToken cancellationToken)
        => service.GetProductDetailAsync(request.ProductId, cancellationToken);
}

public sealed record SearchProductsQuery(string Query, bool IncludeInactive)
    : IRequest<IReadOnlyList<ProductListItemDto>>;

public sealed class SearchProductsQueryHandler(ICatalogInventoryService service)
    : IRequestHandler<SearchProductsQuery, IReadOnlyList<ProductListItemDto>>
{
    public Task<IReadOnlyList<ProductListItemDto>> Handle(SearchProductsQuery request, CancellationToken cancellationToken)
        => service.SearchProductsAsync(request.Query, request.IncludeInactive, cancellationToken);
}

public sealed record GetStockLevelQuery(Guid ProductId) : IRequest<StockLevelDto?>;

public sealed class GetStockLevelQueryHandler(ICatalogInventoryService service)
    : IRequestHandler<GetStockLevelQuery, StockLevelDto?>
{
    public Task<StockLevelDto?> Handle(GetStockLevelQuery request, CancellationToken cancellationToken)
        => service.GetStockLevelAsync(request.ProductId, cancellationToken);
}

public sealed record GetProductReviewsQuery(Guid ProductId, bool IncludePending)
    : IRequest<IReadOnlyList<ProductReviewDto>>;

public sealed class GetProductReviewsQueryHandler(ICatalogInventoryService service)
    : IRequestHandler<GetProductReviewsQuery, IReadOnlyList<ProductReviewDto>>
{
    public Task<IReadOnlyList<ProductReviewDto>> Handle(GetProductReviewsQuery request, CancellationToken cancellationToken)
        => service.GetProductReviewsAsync(request.ProductId, request.IncludePending, cancellationToken);
}
