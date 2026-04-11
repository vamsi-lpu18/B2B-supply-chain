using FluentValidation;
using Order.Application.Abstractions;
using Order.Application.DTOs;
using Order.Domain.Entities;
using Order.Domain.Enums;

namespace Order.Application.Services;

public sealed class OrderService(
    IOrderRepository orderRepository,
    ICreditCheckGateway creditCheckGateway,
    IOrderSagaCoordinator sagaCoordinator,
    IValidator<CreateOrderRequest> createValidator,
    IValidator<CancelOrderRequest> cancelValidator,
    IValidator<BulkUpdateOrderStatusRequest> bulkStatusValidator,
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

        await sagaCoordinator.StartAsync(order.OrderId, order.OrderNumber, order.DealerId, cancellationToken);
        await sagaCoordinator.MarkCreditCheckInProgressAsync(order.OrderId, cancellationToken);

        if (!creditResult.Approved)
        {
            await sagaCoordinator.MarkAwaitingManualApprovalAsync(
                order.OrderId,
                $"Credit check failed. Available credit: {creditResult.AvailableCredit}.",
                cancellationToken);
        }
        else
        {
            await sagaCoordinator.MarkCompletedApprovedAsync(
                order.OrderId,
                "Credit approved and order moved to Processing.",
                cancellationToken);
        }

        var saga = await sagaCoordinator.GetAsync(order.OrderId, cancellationToken);
        return MapOrder(order, saga);
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

        var saga = await sagaCoordinator.GetAsync(order.OrderId, cancellationToken);
        return MapOrder(order, saga);
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
            await SyncSagaForOrderStatusAsync(order.OrderId, newStatus, cancellationToken);
            return true;
        }
        catch (Exception ex) when (IsDbUpdateConcurrencyException(ex))
        {
            return false;
        }
    }

    public async Task<BulkUpdateOrderStatusResultDto> BulkUpdateOrderStatusAsync(
        BulkUpdateOrderStatusRequest request,
        Guid changedByUserId,
        string changedByRole,
        CancellationToken cancellationToken)
    {
        await bulkStatusValidator.ValidateAndThrowAsync(request, cancellationToken);

        var orderIds = request.OrderIds.Distinct().ToList();
        var requestedCount = orderIds.Count;
        if (requestedCount == 0)
        {
            return new BulkUpdateOrderStatusResultDto(0, 0, 0, 0, []);
        }

        var orders = await orderRepository.GetOrdersByIdsAsync(orderIds, cancellationToken);
        var orderMap = orders.ToDictionary(order => order.OrderId);
        var results = new List<BulkOrderStatusItemResultDto>(requestedCount);

        foreach (var orderId in orderIds)
        {
            if (!orderMap.TryGetValue(orderId, out var order))
            {
                results.Add(new BulkOrderStatusItemResultDto(
                    orderId,
                    null,
                    null,
                    false,
                    false,
                    "Order not found."));
                continue;
            }

            if (!order.CanTransitionTo(request.NewStatus))
            {
                results.Add(new BulkOrderStatusItemResultDto(
                    orderId,
                    order.OrderNumber,
                    order.Status,
                    false,
                    false,
                    $"Cannot transition from '{order.Status}' to '{request.NewStatus}'."));
                continue;
            }

            results.Add(new BulkOrderStatusItemResultDto(
                orderId,
                order.OrderNumber,
                order.Status,
                true,
                false,
                null));

            if (request.ValidateOnly)
            {
                continue;
            }

            order.TransitionTo(request.NewStatus, changedByUserId, changedByRole);

            await orderRepository.AddOutboxMessageAsync($"Order{request.NewStatus}", new
            {
                order.OrderId,
                order.OrderNumber,
                order.DealerId,
                order.Status,
                occurredAtUtc = DateTime.UtcNow
            }, cancellationToken);
        }

        if (!request.ValidateOnly && results.Any(result => result.CanTransition))
        {
            try
            {
                await orderRepository.SaveChangesAsync(cancellationToken);
            }
            catch (Exception ex) when (IsDbUpdateConcurrencyException(ex))
            {
                var failedResults = results
                    .Select(result => result.CanTransition
                        ? result with { Message = "Could not update due to concurrent changes." }
                        : result)
                    .ToList();

                return BuildBulkResult(requestedCount, failedResults);
            }

            results = results
                .Select(result => result.CanTransition ? result with { Applied = true } : result)
                .ToList();

            foreach (var result in results.Where(result => result.Applied))
            {
                await SyncSagaForOrderStatusAsync(result.OrderId, request.NewStatus, cancellationToken);
            }
        }

        return BuildBulkResult(requestedCount, results);
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
            await sagaCoordinator.MarkCompletedCancelledAsync(order.OrderId, reason, cancellationToken);
            return true;
        }
        catch (Exception ex) when (IsDbUpdateConcurrencyException(ex))
        {
            return false;
        }
    }

    private async Task SyncSagaForOrderStatusAsync(Guid orderId, OrderStatus status, CancellationToken cancellationToken)
    {
        switch (status)
        {
            case OrderStatus.OnHold:
                await sagaCoordinator.MarkAwaitingManualApprovalAsync(orderId, "Order moved to OnHold.", cancellationToken);
                break;
            case OrderStatus.Processing:
            case OrderStatus.ReadyForDispatch:
            case OrderStatus.InTransit:
            case OrderStatus.Delivered:
            case OrderStatus.Closed:
            case OrderStatus.ReturnRequested:
            case OrderStatus.ReturnApproved:
            case OrderStatus.ReturnRejected:
                await sagaCoordinator.MarkCompletedApprovedAsync(orderId, $"Order moved to {status}.", cancellationToken);
                break;
            case OrderStatus.Cancelled:
                await sagaCoordinator.MarkCompletedCancelledAsync(orderId, "Order moved to Cancelled.", cancellationToken);
                break;
            case OrderStatus.Exception:
                await sagaCoordinator.MarkAwaitingManualApprovalAsync(orderId, "Order moved to Exception state.", cancellationToken);
                break;
            default:
                break;
        }
    }

    private static bool IsDbUpdateConcurrencyException(Exception ex)
    {
        return string.Equals(ex.GetType().Name, "DbUpdateConcurrencyException", StringComparison.Ordinal);
    }

    private static BulkUpdateOrderStatusResultDto BuildBulkResult(
        int requestedCount,
        IReadOnlyList<BulkOrderStatusItemResultDto> results)
    {
        var validCount = results.Count(result => result.CanTransition);
        var appliedCount = results.Count(result => result.Applied);
        var invalidCount = results.Count - validCount;

        return new BulkUpdateOrderStatusResultDto(
            requestedCount,
            validCount,
            invalidCount,
            appliedCount,
            results);
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
        await sagaCoordinator.MarkCompletedApprovedAsync(order.OrderId, "On-hold order approved by admin.", cancellationToken);
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
        await sagaCoordinator.MarkCompletedRejectedAsync(order.OrderId, reason, cancellationToken);
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

    public async Task<bool> ApproveReturnAsync(Guid orderId, Guid adminUserId, CancellationToken cancellationToken)
    {
        var order = await orderRepository.GetOrderByIdAsync(orderId, cancellationToken);
        if (order is null || order.Status != OrderStatus.ReturnRequested || order.ReturnRequest is null)
        {
            return false;
        }

        order.ApproveReturn(adminUserId, "Admin");

        await orderRepository.AddOutboxMessageAsync("ReturnApproved", new
        {
            order.OrderId,
            order.OrderNumber,
            order.DealerId,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        await orderRepository.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> RejectReturnAsync(Guid orderId, string reason, Guid adminUserId, CancellationToken cancellationToken)
    {
        await returnValidator.ValidateAndThrowAsync(new ReturnRequestDto(reason), cancellationToken);

        var order = await orderRepository.GetOrderByIdAsync(orderId, cancellationToken);
        if (order is null || order.Status != OrderStatus.ReturnRequested || order.ReturnRequest is null)
        {
            return false;
        }

        order.RejectReturn(adminUserId, "Admin");

        await orderRepository.AddOutboxMessageAsync("ReturnRejected", new
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

    private static OrderDto MapOrder(OrderAggregate order, OrderSagaDto? saga)
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
            returnRequest,
            saga);
    }
}
