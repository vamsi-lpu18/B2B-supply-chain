using MediatR;
using Order.Application.Abstractions;
using Order.Application.DTOs;

namespace Order.Application.Features.Orders;

public sealed record GetOrderQuery(Guid OrderId, Guid RequesterUserId, string RequesterRole) : IRequest<OrderDto?>;

public sealed class GetOrderQueryHandler(IOrderService service) : IRequestHandler<GetOrderQuery, OrderDto?>
{
    public Task<OrderDto?> Handle(GetOrderQuery request, CancellationToken cancellationToken)
        => service.GetOrderAsync(request.OrderId, request.RequesterUserId, request.RequesterRole, cancellationToken);
}

public sealed record GetDealerOrdersQuery(Guid DealerId, int Page, int PageSize)
    : IRequest<PagedResult<OrderListItemDto>>;

public sealed class GetDealerOrdersQueryHandler(IOrderService service)
    : IRequestHandler<GetDealerOrdersQuery, PagedResult<OrderListItemDto>>
{
    public Task<PagedResult<OrderListItemDto>> Handle(GetDealerOrdersQuery request, CancellationToken cancellationToken)
        => service.GetDealerOrdersAsync(request.DealerId, request.Page, request.PageSize, cancellationToken);
}

public sealed record GetAllOrdersQuery(int Page, int PageSize, int? Status)
    : IRequest<PagedResult<OrderListItemDto>>;

public sealed class GetAllOrdersQueryHandler(IOrderService service)
    : IRequestHandler<GetAllOrdersQuery, PagedResult<OrderListItemDto>>
{
    public Task<PagedResult<OrderListItemDto>> Handle(GetAllOrdersQuery request, CancellationToken cancellationToken)
        => service.GetAllOrdersAsync(request.Page, request.PageSize, request.Status, cancellationToken);
}
