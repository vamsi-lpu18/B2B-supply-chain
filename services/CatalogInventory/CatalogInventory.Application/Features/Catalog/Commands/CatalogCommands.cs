using CatalogInventory.Application.Abstractions;
using CatalogInventory.Application.DTOs;
using MediatR;

namespace CatalogInventory.Application.Features.Catalog;

public sealed record CreateProductCommand(CreateProductRequest Request) : IRequest<ProductDto>;

public sealed class CreateProductCommandHandler(ICatalogInventoryService service)
    : IRequestHandler<CreateProductCommand, ProductDto>
{
    public Task<ProductDto> Handle(CreateProductCommand request, CancellationToken cancellationToken)
        => service.CreateProductAsync(request.Request, cancellationToken);
}

public sealed record UpdateProductCommand(Guid ProductId, UpdateProductRequest Request) : IRequest<ProductDto?>;

public sealed class UpdateProductCommandHandler(ICatalogInventoryService service)
    : IRequestHandler<UpdateProductCommand, ProductDto?>
{
    public Task<ProductDto?> Handle(UpdateProductCommand request, CancellationToken cancellationToken)
        => service.UpdateProductAsync(request.ProductId, request.Request, cancellationToken);
}

public sealed record DeactivateProductCommand(Guid ProductId) : IRequest<bool>;

public sealed class DeactivateProductCommandHandler(ICatalogInventoryService service)
    : IRequestHandler<DeactivateProductCommand, bool>
{
    public Task<bool> Handle(DeactivateProductCommand request, CancellationToken cancellationToken)
        => service.DeactivateProductAsync(request.ProductId, cancellationToken);
}

public sealed record RestockProductCommand(Guid ProductId, RestockProductRequest Request) : IRequest<bool>;

public sealed class RestockProductCommandHandler(ICatalogInventoryService service)
    : IRequestHandler<RestockProductCommand, bool>
{
    public Task<bool> Handle(RestockProductCommand request, CancellationToken cancellationToken)
        => service.RestockProductAsync(request.ProductId, request.Request, cancellationToken);
}

public sealed record SoftLockStockCommand(SoftLockStockRequest Request) : IRequest<bool>;

public sealed class SoftLockStockCommandHandler(ICatalogInventoryService service)
    : IRequestHandler<SoftLockStockCommand, bool>
{
    public Task<bool> Handle(SoftLockStockCommand request, CancellationToken cancellationToken)
        => service.SoftLockStockAsync(request.Request, cancellationToken);
}

public sealed record HardDeductStockCommand(HardDeductStockRequest Request) : IRequest<bool>;

public sealed class HardDeductStockCommandHandler(ICatalogInventoryService service)
    : IRequestHandler<HardDeductStockCommand, bool>
{
    public Task<bool> Handle(HardDeductStockCommand request, CancellationToken cancellationToken)
        => service.HardDeductStockAsync(request.Request, cancellationToken);
}

public sealed record ReleaseSoftLockCommand(ReleaseSoftLockRequest Request) : IRequest<bool>;

public sealed class ReleaseSoftLockCommandHandler(ICatalogInventoryService service)
    : IRequestHandler<ReleaseSoftLockCommand, bool>
{
    public Task<bool> Handle(ReleaseSoftLockCommand request, CancellationToken cancellationToken)
        => service.ReleaseSoftLockAsync(request.Request, cancellationToken);
}

public sealed record SubscribeStockCommand(StockSubscriptionRequest Request) : IRequest<bool>;

public sealed class SubscribeStockCommandHandler(ICatalogInventoryService service)
    : IRequestHandler<SubscribeStockCommand, bool>
{
    public Task<bool> Handle(SubscribeStockCommand request, CancellationToken cancellationToken)
        => service.SubscribeStockAsync(request.Request, cancellationToken);
}

public sealed record UnsubscribeStockCommand(StockSubscriptionRequest Request) : IRequest<bool>;

public sealed class UnsubscribeStockCommandHandler(ICatalogInventoryService service)
    : IRequestHandler<UnsubscribeStockCommand, bool>
{
    public Task<bool> Handle(UnsubscribeStockCommand request, CancellationToken cancellationToken)
        => service.UnsubscribeStockAsync(request.Request, cancellationToken);
}

public sealed record CreateProductReviewCommand(Guid ProductId, Guid DealerId, CreateProductReviewRequest Request)
    : IRequest<ProductReviewDto?>;

public sealed class CreateProductReviewCommandHandler(ICatalogInventoryService service)
    : IRequestHandler<CreateProductReviewCommand, ProductReviewDto?>
{
    public Task<ProductReviewDto?> Handle(CreateProductReviewCommand request, CancellationToken cancellationToken)
        => service.AddProductReviewAsync(request.ProductId, request.DealerId, request.Request, cancellationToken);
}

public sealed record ApproveProductReviewCommand(Guid ReviewId, Guid AdminUserId, string? Note)
    : IRequest<ProductReviewDto?>;

public sealed class ApproveProductReviewCommandHandler(ICatalogInventoryService service)
    : IRequestHandler<ApproveProductReviewCommand, ProductReviewDto?>
{
    public Task<ProductReviewDto?> Handle(ApproveProductReviewCommand request, CancellationToken cancellationToken)
        => service.ApproveProductReviewAsync(request.ReviewId, request.AdminUserId, request.Note, cancellationToken);
}

public sealed record RejectProductReviewCommand(Guid ReviewId, Guid AdminUserId, string? Note)
    : IRequest<ProductReviewDto?>;

public sealed class RejectProductReviewCommandHandler(ICatalogInventoryService service)
    : IRequestHandler<RejectProductReviewCommand, ProductReviewDto?>
{
    public Task<ProductReviewDto?> Handle(RejectProductReviewCommand request, CancellationToken cancellationToken)
        => service.RejectProductReviewAsync(request.ReviewId, request.AdminUserId, request.Note, cancellationToken);
}
