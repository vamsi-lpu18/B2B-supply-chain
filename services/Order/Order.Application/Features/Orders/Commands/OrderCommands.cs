using MediatR;
using Order.Application.Abstractions;
using Order.Application.DTOs;
using Order.Domain.Enums;

namespace Order.Application.Features.Orders;

public sealed record CreateOrderCommand(Guid DealerId, CreateOrderRequest Request) : IRequest<OrderDto>;

public sealed class CreateOrderCommandHandler(IOrderService service) : IRequestHandler<CreateOrderCommand, OrderDto>
{
    public Task<OrderDto> Handle(CreateOrderCommand request, CancellationToken cancellationToken)
        => service.CreateOrderAsync(request.DealerId, request.Request, cancellationToken);
}

public sealed record UpdateOrderStatusCommand(
    Guid OrderId,
    OrderStatus NewStatus,
    Guid ChangedByUserId,
    string ChangedByRole) : IRequest<bool>;

public sealed class UpdateOrderStatusCommandHandler(IOrderService service)
    : IRequestHandler<UpdateOrderStatusCommand, bool>
{
    public Task<bool> Handle(UpdateOrderStatusCommand request, CancellationToken cancellationToken)
        => service.UpdateOrderStatusAsync(
            request.OrderId,
            request.NewStatus,
            request.ChangedByUserId,
            request.ChangedByRole,
            cancellationToken);
}

public sealed record BulkUpdateOrderStatusCommand(
    BulkUpdateOrderStatusRequest Request,
    Guid ChangedByUserId,
    string ChangedByRole) : IRequest<BulkUpdateOrderStatusResultDto>;

public sealed class BulkUpdateOrderStatusCommandHandler(IOrderService service)
    : IRequestHandler<BulkUpdateOrderStatusCommand, BulkUpdateOrderStatusResultDto>
{
    public Task<BulkUpdateOrderStatusResultDto> Handle(BulkUpdateOrderStatusCommand request, CancellationToken cancellationToken)
        => service.BulkUpdateOrderStatusAsync(
            request.Request,
            request.ChangedByUserId,
            request.ChangedByRole,
            cancellationToken);
}

public sealed record CancelOrderCommand(
    Guid OrderId,
    string Reason,
    Guid ChangedByUserId,
    string ChangedByRole) : IRequest<bool>;

public sealed class CancelOrderCommandHandler(IOrderService service)
    : IRequestHandler<CancelOrderCommand, bool>
{
    public Task<bool> Handle(CancelOrderCommand request, CancellationToken cancellationToken)
        => service.CancelOrderAsync(
            request.OrderId,
            request.Reason,
            request.ChangedByUserId,
            request.ChangedByRole,
            cancellationToken);
}

public sealed record ApproveOnHoldCommand(Guid OrderId, Guid AdminUserId) : IRequest<bool>;

public sealed class ApproveOnHoldCommandHandler(IOrderService service)
    : IRequestHandler<ApproveOnHoldCommand, bool>
{
    public Task<bool> Handle(ApproveOnHoldCommand request, CancellationToken cancellationToken)
        => service.ApproveOnHoldAsync(request.OrderId, request.AdminUserId, cancellationToken);
}

public sealed record RejectOnHoldCommand(Guid OrderId, string Reason, Guid AdminUserId) : IRequest<bool>;

public sealed class RejectOnHoldCommandHandler(IOrderService service)
    : IRequestHandler<RejectOnHoldCommand, bool>
{
    public Task<bool> Handle(RejectOnHoldCommand request, CancellationToken cancellationToken)
        => service.RejectOnHoldAsync(request.OrderId, request.Reason, request.AdminUserId, cancellationToken);
}

public sealed record RequestReturnCommand(Guid OrderId, Guid DealerId, string Reason) : IRequest<bool>;

public sealed class RequestReturnCommandHandler(IOrderService service)
    : IRequestHandler<RequestReturnCommand, bool>
{
    public Task<bool> Handle(RequestReturnCommand request, CancellationToken cancellationToken)
        => service.RequestReturnAsync(request.OrderId, request.DealerId, request.Reason, cancellationToken);
}

public sealed record ApproveReturnCommand(Guid OrderId, Guid AdminUserId) : IRequest<bool>;

public sealed class ApproveReturnCommandHandler(IOrderService service)
    : IRequestHandler<ApproveReturnCommand, bool>
{
    public Task<bool> Handle(ApproveReturnCommand request, CancellationToken cancellationToken)
        => service.ApproveReturnAsync(request.OrderId, request.AdminUserId, cancellationToken);
}

public sealed record RejectReturnCommand(Guid OrderId, string Reason, Guid AdminUserId) : IRequest<bool>;

public sealed class RejectReturnCommandHandler(IOrderService service)
    : IRequestHandler<RejectReturnCommand, bool>
{
    public Task<bool> Handle(RejectReturnCommand request, CancellationToken cancellationToken)
        => service.RejectReturnAsync(request.OrderId, request.Reason, request.AdminUserId, cancellationToken);
}
