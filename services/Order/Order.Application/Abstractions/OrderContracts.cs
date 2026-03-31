using Order.Application.DTOs;
using Order.Domain.Entities;
using Order.Domain.Enums;

namespace Order.Application.Abstractions;

public interface IOrderService
{
    Task<OrderDto> CreateOrderAsync(Guid dealerId, CreateOrderRequest request, CancellationToken cancellationToken);
    Task<OrderDto?> GetOrderAsync(Guid orderId, Guid requesterUserId, string requesterRole, CancellationToken cancellationToken);
    Task<PagedResult<OrderListItemDto>> GetDealerOrdersAsync(Guid dealerId, int page, int pageSize, CancellationToken cancellationToken);
    Task<PagedResult<OrderListItemDto>> GetAllOrdersAsync(int page, int pageSize, int? status, CancellationToken cancellationToken);
    Task<bool> UpdateOrderStatusAsync(Guid orderId, OrderStatus newStatus, Guid changedByUserId, string changedByRole, CancellationToken cancellationToken);
    Task<bool> CancelOrderAsync(Guid orderId, string reason, Guid changedByUserId, string changedByRole, CancellationToken cancellationToken);
    Task<bool> ApproveOnHoldAsync(Guid orderId, Guid adminUserId, CancellationToken cancellationToken);
    Task<bool> RejectOnHoldAsync(Guid orderId, string reason, Guid adminUserId, CancellationToken cancellationToken);
    Task<bool> RequestReturnAsync(Guid orderId, Guid dealerId, string reason, CancellationToken cancellationToken);
}

public interface IOrderRepository
{
    Task AddOrderAsync(OrderAggregate order, CancellationToken cancellationToken);
    Task<OrderAggregate?> GetOrderByIdAsync(Guid orderId, CancellationToken cancellationToken);
    Task<(IReadOnlyList<OrderAggregate> Items, int TotalCount)> GetDealerOrdersAsync(Guid dealerId, int page, int pageSize, CancellationToken cancellationToken);
    Task<(IReadOnlyList<OrderAggregate> Items, int TotalCount)> GetAllOrdersAsync(int page, int pageSize, int? status, CancellationToken cancellationToken);
    Task AddOutboxMessageAsync(string eventType, object payload, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}

public interface ICreditCheckGateway
{
    Task<CreditCheckResult> CheckCreditAsync(Guid dealerId, decimal amount, CancellationToken cancellationToken);
}
