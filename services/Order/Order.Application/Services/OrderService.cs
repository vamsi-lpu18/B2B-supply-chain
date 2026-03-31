using FluentValidation;
using Order.Application.Abstractions;
using Order.Application.DTOs;
using Order.Domain.Entities;
using Order.Domain.Enums;

namespace Order.Application.Services;

public sealed class OrderService(
    IOrderRepository orderRepository,
    ICreditCheckGateway creditCheckGateway,
    IValidator<CreateOrderRequest> createValidator,
    IValidator<CancelOrderRequest> cancelValidator,
    IValidator<ReturnRequestDto> returnValidator)
    : IOrderService
{
    public async Task<OrderDto> CreateOrderAsync(Guid dealerId, CreateOrderRequest request, CancellationToken cancellationToken)
    {
        await createValidator.ValidateAndThrowAsync(request, cancellationToken);

        var orderNumber = GenerateOrderNumber();
        var order = OrderAggregate.Create(dealerId, orderNumber, request.PaymentMode);

        foreach (var line in request.Lines)
        {
            order.AddLine(
                line.ProductId,
                line.ProductName,
                line.Sku,
                line.Quantity,
                line.UnitPrice,
                line.MinOrderQty);
        }

        var creditResult = await creditCheckGateway.CheckCreditAsync(order.DealerId, order.TotalAmount, cancellationToken);

        if (!creditResult.Approved)
        {
            order.MarkCreditHold();

            await orderRepository.AddOutboxMessageAsync("AdminApprovalRequired", new
            {
                order.OrderId,
                order.OrderNumber,
                order.DealerId,
                order.TotalAmount,
                creditResult.AvailableCredit,
                occurredAtUtc = DateTime.UtcNow
            }, cancellationToken);
        }
        else
        {
            order.MarkCreditApproved();
            order.TransitionTo(OrderStatus.Processing, dealerId, "Dealer");

            await orderRepository.AddOutboxMessageAsync("OrderPlaced", new
            {
                order.OrderId,
                order.OrderNumber,
                order.DealerId,
                order.TotalAmount,
                occurredAtUtc = DateTime.UtcNow
            }, cancellationToken);
        }

        await orderRepository.AddOrderAsync(order, cancellationToken);
        await orderRepository.SaveChangesAsync(cancellationToken);

        return MapOrder(order);
    }

    public async Task<OrderDto?> GetOrderAsync(Guid orderId, Guid requesterUserId, string requesterRole, CancellationToken cancellationToken)
    {
        var order = await orderRepository.GetOrderByIdAsync(orderId, cancellationToken);
        if (order is null)
        {
            return null;
        }

        var isAdminLike = string.Equals(requesterRole, "Admin", StringComparison.OrdinalIgnoreCase)
            || string.Equals(requesterRole, "Warehouse", StringComparison.OrdinalIgnoreCase)
            || string.Equals(requesterRole, "Logistics", StringComparison.OrdinalIgnoreCase);

        if (!isAdminLike && order.DealerId != requesterUserId)
        {
            return null;
        }

        return MapOrder(order);
    }

    public async Task<PagedResult<OrderListItemDto>> GetDealerOrdersAsync(Guid dealerId, int page, int pageSize, CancellationToken cancellationToken)
    {
        page = page <= 0 ? 1 : page;
        pageSize = pageSize <= 0 ? 20 : Math.Min(pageSize, 100);

        var (items, totalCount) = await orderRepository.GetDealerOrdersAsync(dealerId, page, pageSize, cancellationToken);
        var mapped = items.Select(MapOrderListItem).ToList();

        return new PagedResult<OrderListItemDto>(mapped, totalCount, page, pageSize);
    }

    public async Task<PagedResult<OrderListItemDto>> GetAllOrdersAsync(int page, int pageSize, int? status, CancellationToken cancellationToken)
    {
        page = page <= 0 ? 1 : page;
        pageSize = pageSize <= 0 ? 20 : Math.Min(pageSize, 100);

        var (items, totalCount) = await orderRepository.GetAllOrdersAsync(page, pageSize, status, cancellationToken);
        var mapped = items.Select(MapOrderListItem).ToList();

        return new PagedResult<OrderListItemDto>(mapped, totalCount, page, pageSize);
    }

    public async Task<bool> UpdateOrderStatusAsync(
        Guid orderId,
        OrderStatus newStatus,
        Guid changedByUserId,
        string changedByRole,
        CancellationToken cancellationToken)
    {
        var order = await orderRepository.GetOrderByIdAsync(orderId, cancellationToken);
        if (order is null)
        {
            return false;
        }

        order.TransitionTo(newStatus, changedByUserId, changedByRole);

        await orderRepository.AddOutboxMessageAsync($"Order{newStatus}", new
        {
            order.OrderId,
            order.OrderNumber,
            order.DealerId,
            order.Status,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        try
        {
            await orderRepository.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (Exception ex) when (IsDbUpdateConcurrencyException(ex))
        {
            return false;
        }
    }

    public async Task<bool> CancelOrderAsync(
        Guid orderId,
        string reason,
        Guid changedByUserId,
        string changedByRole,
        CancellationToken cancellationToken)
    {
        await cancelValidator.ValidateAndThrowAsync(new CancelOrderRequest(reason), cancellationToken);

        var order = await orderRepository.GetOrderByIdAsync(orderId, cancellationToken);
        if (order is null)
        {
            return false;
        }

        order.Cancel(reason, changedByUserId, changedByRole);

        await orderRepository.AddOutboxMessageAsync("OrderCancelled", new
        {
            order.OrderId,
            order.OrderNumber,
            order.DealerId,
            reason,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        try
        {
            await orderRepository.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (Exception ex) when (IsDbUpdateConcurrencyException(ex))
        {
            return false;
        }
    }

    private static bool IsDbUpdateConcurrencyException(Exception ex)
    {
        return string.Equals(ex.GetType().Name, "DbUpdateConcurrencyException", StringComparison.Ordinal);
    }

    public async Task<bool> ApproveOnHoldAsync(Guid orderId, Guid adminUserId, CancellationToken cancellationToken)
    {
        var order = await orderRepository.GetOrderByIdAsync(orderId, cancellationToken);
        if (order is null || order.Status != OrderStatus.OnHold)
        {
            return false;
        }

        order.MarkCreditApproved();
        order.TransitionTo(OrderStatus.Processing, adminUserId, "Admin");

        await orderRepository.AddOutboxMessageAsync("OrderApproved", new
        {
            order.OrderId,
            order.OrderNumber,
            order.DealerId,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        await orderRepository.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> RejectOnHoldAsync(Guid orderId, string reason, Guid adminUserId, CancellationToken cancellationToken)
    {
        var order = await orderRepository.GetOrderByIdAsync(orderId, cancellationToken);
        if (order is null || order.Status != OrderStatus.OnHold)
        {
            return false;
        }

        order.MarkCreditRejected(reason);

        await orderRepository.AddOutboxMessageAsync("OrderCancelled", new
        {
            order.OrderId,
            order.OrderNumber,
            order.DealerId,
            reason,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        await orderRepository.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> RequestReturnAsync(Guid orderId, Guid dealerId, string reason, CancellationToken cancellationToken)
    {
        await returnValidator.ValidateAndThrowAsync(new ReturnRequestDto(reason), cancellationToken);

        var order = await orderRepository.GetOrderByIdAsync(orderId, cancellationToken);
        if (order is null || order.DealerId != dealerId)
        {
            return false;
        }

        order.RaiseReturn(dealerId, reason);

        await orderRepository.AddOutboxMessageAsync("ReturnRequested", new
        {
            order.OrderId,
            order.OrderNumber,
            order.DealerId,
            reason,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        await orderRepository.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static string GenerateOrderNumber()
    {
        var year = DateTime.UtcNow.Year;
        var suffix = Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
        return $"ORD-{year}-{suffix}";
    }

    private static OrderListItemDto MapOrderListItem(OrderAggregate order)
    {
        return new OrderListItemDto(
            order.OrderId,
            order.OrderNumber,
            order.DealerId,
            order.Status,
            order.TotalAmount,
            order.PlacedAtUtc);
    }

    private static OrderDto MapOrder(OrderAggregate order)
    {
        var lines = order.Lines
            .Select(line => new OrderLineDto(
                line.OrderLineId,
                line.ProductId,
                line.ProductName,
                line.Sku,
                line.Quantity,
                line.UnitPrice,
                line.LineTotal))
            .ToList();

        var history = order.StatusHistory
            .OrderBy(h => h.ChangedAtUtc)
            .Select(h => new OrderStatusHistoryDto(
                h.HistoryId,
                h.FromStatus,
                h.ToStatus,
                h.ChangedByUserId,
                h.ChangedByRole,
                h.ChangedAtUtc))
            .ToList();

        ReturnInfoDto? returnRequest = null;
        if (order.ReturnRequest is not null)
        {
            returnRequest = new ReturnInfoDto(
                order.ReturnRequest.ReturnRequestId,
                order.ReturnRequest.Reason,
                order.ReturnRequest.RequestedAtUtc,
                order.ReturnRequest.IsApproved,
                order.ReturnRequest.IsRejected,
                order.ReturnRequest.ReviewedAtUtc);
        }

        return new OrderDto(
            order.OrderId,
            order.OrderNumber,
            order.DealerId,
            order.Status,
            order.CreditHoldStatus,
            order.PaymentMode,
            order.TotalAmount,
            order.PlacedAtUtc,
            order.CancellationReason,
            lines,
            history,
            returnRequest);
    }
}
