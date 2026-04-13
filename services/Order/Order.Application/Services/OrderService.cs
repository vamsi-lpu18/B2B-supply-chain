using FluentValidation;
using Order.Application.Abstractions;
using Order.Application.DTOs;
using Order.Domain.Entities;
using Order.Domain.Enums;
/// <summary>
/// The OrderService class implements the IOrderService interface and provides methods for managing orders, including creating orders, retrieving order details, updating order statuses, and handling order cancellations and returns. It interacts with the order repository for data persistence, gateways for credit checks and inventory management, and a saga coordinator for orchestrating long-running processes related to orders.
/// </summary>
///     <remarks>
/// The OrderService is responsible for enforcing business rules around order processing, such as validating requests,  managing stock reservations, and ensuring that only authorized roles can perform certain actions on orders. It also handles the coordination of sagas to manage complex workflows that may involve multiple steps and external systems, such as credit checks and inventory updates.
/// </remarks>
namespace Order.Application.Services;

public sealed class OrderService(
    IOrderRepository orderRepository,
    ICreditCheckGateway creditCheckGateway,
    IInventoryGateway inventoryGateway,
    IOrderSagaCoordinator sagaCoordinator,
    IValidator<CreateOrderRequest> createValidator,
    IValidator<CancelOrderRequest> cancelValidator,
    IValidator<BulkUpdateOrderStatusRequest> bulkStatusValidator,
    IValidator<ReturnRequestDto> returnValidator)
    : IOrderService
{
    private static readonly HashSet<OrderStatus> _logisticsManagedOrderStatuses =
    [
        OrderStatus.ReadyForDispatch,
        OrderStatus.InTransit,
        OrderStatus.Exception,
        OrderStatus.Delivered
    ];

    private static readonly HashSet<OrderStatus> _warehouseManagedOrderStatuses =
    [
        OrderStatus.ReadyForDispatch
    ];

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

        var stockSoftLocked = await SoftLockOrderStockAsync(order, cancellationToken);
        if (!stockSoftLocked)
        {
            throw new InvalidOperationException("Unable to reserve stock for one or more order lines.");
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

    public Task<OrderAnalyticsDto> GetOrderAnalyticsAsync(int days, int top, CancellationToken cancellationToken)
    {
        var safeDays = Math.Clamp(days, 7, 365);
        var safeTop = Math.Clamp(top, 3, 20);
        var fromUtc = DateTime.UtcNow.Date.AddDays(-safeDays + 1);

        return orderRepository.GetOrderAnalyticsAsync(fromUtc, safeTop, cancellationToken);
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

        if (!CanRoleManageOrderStatus(changedByRole, newStatus))
        {
            throw new InvalidOperationException(BuildRoleTransitionDeniedMessage(changedByRole, newStatus));
        }

        if (!order.CanTransitionTo(newStatus))
        {
            throw new InvalidOperationException($"Cannot transition order from '{order.Status}' to '{newStatus}'.");
        }

        var inventoryFailure = await TryApplyInventoryForTransitionAsync(order, newStatus, cancellationToken);
        if (!string.IsNullOrWhiteSpace(inventoryFailure))
        {
            throw new InvalidOperationException(inventoryFailure);
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

            if (!CanRoleManageOrderStatus(changedByRole, request.NewStatus))
            {
                results.Add(new BulkOrderStatusItemResultDto(
                    orderId,
                    order.OrderNumber,
                    order.Status,
                    false,
                    false,
                    BuildRoleTransitionDeniedMessage(changedByRole, request.NewStatus)));
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

            if (request.ValidateOnly)
            {
                results.Add(new BulkOrderStatusItemResultDto(
                    orderId,
                    order.OrderNumber,
                    order.Status,
                    true,
                    false,
                    null));
                continue;
            }

            var inventoryFailure = await TryApplyInventoryForTransitionAsync(order, request.NewStatus, cancellationToken);
            if (!string.IsNullOrWhiteSpace(inventoryFailure))
            {
                results.Add(new BulkOrderStatusItemResultDto(
                    orderId,
                    order.OrderNumber,
                    order.Status,
                    false,
                    false,
                    inventoryFailure));
                continue;
            }

            var currentStatus = order.Status;
            order.TransitionTo(request.NewStatus, changedByUserId, changedByRole);

            await orderRepository.AddOutboxMessageAsync($"Order{request.NewStatus}", new
            {
                order.OrderId,
                order.OrderNumber,
                order.DealerId,
                order.Status,
                occurredAtUtc = DateTime.UtcNow
            }, cancellationToken);

            results.Add(new BulkOrderStatusItemResultDto(
                orderId,
                order.OrderNumber,
                currentStatus,
                true,
                false,
                null));
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

        if (!order.CanTransitionTo(OrderStatus.Cancelled))
        {
            throw new InvalidOperationException($"Cannot transition order from '{order.Status}' to '{OrderStatus.Cancelled}'.");
        }

        var inventoryFailure = await TryApplyInventoryForTransitionAsync(order, OrderStatus.Cancelled, cancellationToken);
        if (!string.IsNullOrWhiteSpace(inventoryFailure))
        {
            throw new InvalidOperationException(inventoryFailure);
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

        var inventoryFailure = await TryApplyInventoryForTransitionAsync(order, OrderStatus.Cancelled, cancellationToken);
        if (!string.IsNullOrWhiteSpace(inventoryFailure))
        {
            throw new InvalidOperationException(inventoryFailure);
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

    private static bool CanRoleManageOrderStatus(string role, OrderStatus targetStatus)
    {
        if (string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (string.Equals(role, "Logistics", StringComparison.OrdinalIgnoreCase))
        {
            return _logisticsManagedOrderStatuses.Contains(targetStatus);
        }

        if (string.Equals(role, "Warehouse", StringComparison.OrdinalIgnoreCase))
        {
            return _warehouseManagedOrderStatuses.Contains(targetStatus);
        }

        return false;
    }

    private static string BuildRoleTransitionDeniedMessage(string role, OrderStatus targetStatus)
    {
        return $"Role '{role}' cannot move orders to '{targetStatus}'.";
    }

    private async Task<string?> TryApplyInventoryForTransitionAsync(OrderAggregate order, OrderStatus targetStatus, CancellationToken cancellationToken)
    {
        if (targetStatus == OrderStatus.InTransit && order.Status == OrderStatus.ReadyForDispatch)
        {
            var deducted = await HardDeductReservedStockAsync(order, cancellationToken);
            if (!deducted)
            {
                return "Unable to deduct reserved stock while moving order to InTransit.";
            }
        }

        if (targetStatus == OrderStatus.Cancelled && ShouldReleaseReservedStock(order.Status))
        {
            var released = await ReleaseSoftLockedStockAsync(order, cancellationToken);
            if (!released)
            {
                return "Unable to release reserved stock while cancelling order.";
            }
        }

        return null;
    }

    private async Task<bool> SoftLockOrderStockAsync(OrderAggregate order, CancellationToken cancellationToken)
    {
        var stockLines = BuildOrderStockLines(order);
        var lockedProductIds = new List<Guid>(stockLines.Count);

        foreach (var stockLine in stockLines)
        {
            var locked = await inventoryGateway.SoftLockStockAsync(order.OrderId, stockLine.ProductId, stockLine.Quantity, cancellationToken);
            if (!locked)
            {
                await ReleaseSoftLocksBestEffortAsync(order.OrderId, lockedProductIds, cancellationToken);
                return false;
            }

            lockedProductIds.Add(stockLine.ProductId);
        }

        return true;
    }

    private async Task<bool> HardDeductReservedStockAsync(OrderAggregate order, CancellationToken cancellationToken)
    {
        var stockLines = BuildOrderStockLines(order);
        foreach (var stockLine in stockLines)
        {
            var deducted = await inventoryGateway.HardDeductStockAsync(order.OrderId, stockLine.ProductId, stockLine.Quantity, cancellationToken);
            if (deducted)
            {
                continue;
            }

            // Soft-locks can expire before dispatch; try to reserve again and retry once.
            var relocked = await inventoryGateway.SoftLockStockAsync(order.OrderId, stockLine.ProductId, stockLine.Quantity, cancellationToken);
            if (!relocked)
            {
                return false;
            }

            deducted = await inventoryGateway.HardDeductStockAsync(order.OrderId, stockLine.ProductId, stockLine.Quantity, cancellationToken);
            if (!deducted)
            {
                await inventoryGateway.ReleaseSoftLockAsync(order.OrderId, stockLine.ProductId, cancellationToken);
                return false;
            }
        }

        return true;
    }

    private async Task<bool> ReleaseSoftLockedStockAsync(OrderAggregate order, CancellationToken cancellationToken)
    {
        var stockLines = BuildOrderStockLines(order);
        foreach (var stockLine in stockLines)
        {
            var released = await inventoryGateway.ReleaseSoftLockAsync(order.OrderId, stockLine.ProductId, cancellationToken);
            if (!released)
            {
                return false;
            }
        }

        return true;
    }

    private async Task ReleaseSoftLocksBestEffortAsync(Guid orderId, IReadOnlyCollection<Guid> productIds, CancellationToken cancellationToken)
    {
        foreach (var productId in productIds)
        {
            try
            {
                await inventoryGateway.ReleaseSoftLockAsync(orderId, productId, cancellationToken);
            }
            catch
            {
                // Best effort rollback for partial soft-locks.
            }
        }
    }

    private static bool ShouldReleaseReservedStock(OrderStatus currentStatus)
    {
        return currentStatus == OrderStatus.Placed
            || currentStatus == OrderStatus.OnHold
            || currentStatus == OrderStatus.Processing
            || currentStatus == OrderStatus.ReadyForDispatch;
    }

    private static IReadOnlyList<OrderStockLine> BuildOrderStockLines(OrderAggregate order)
    {
        return order.Lines
            .GroupBy(line => line.ProductId)
            .Select(group => new OrderStockLine(group.Key, group.Sum(line => line.Quantity)))
            .ToList();
    }

    private readonly record struct OrderStockLine(Guid ProductId, int Quantity);

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
