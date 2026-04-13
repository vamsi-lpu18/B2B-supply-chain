using Order.Domain.Enums;

namespace Order.Application.DTOs;

public sealed record CreateOrderLineRequest(
    Guid ProductId,
    string ProductName,
    string Sku,
    int Quantity,
    decimal UnitPrice,
    int MinOrderQty);

public sealed record CreateOrderRequest(
    PaymentMode PaymentMode,
    string? IdempotencyKey,
    IReadOnlyList<CreateOrderLineRequest> Lines);

public sealed record CancelOrderRequest(string Reason);

public sealed record UpdateOrderStatusRequest(OrderStatus NewStatus);

public sealed record BulkUpdateOrderStatusRequest(
    OrderStatus NewStatus,
    IReadOnlyList<Guid> OrderIds,
    bool ValidateOnly = false);

public sealed record BulkOrderStatusItemResultDto(
    Guid OrderId,
    string? OrderNumber,
    OrderStatus? CurrentStatus,
    bool CanTransition,
    bool Applied,
    string? Message);

public sealed record BulkUpdateOrderStatusResultDto(
    int RequestedCount,
    int ValidCount,
    int InvalidCount,
    int AppliedCount,
    IReadOnlyList<BulkOrderStatusItemResultDto> Results);

public sealed record ReturnRequestDto(string Reason);

public sealed record AdminDecisionRequest(string? Reason);

public sealed record CreditCheckResult(bool Approved, decimal AvailableCredit, decimal CreditLimit, decimal CurrentOutstanding);

public enum OrderSagaState
{
    Started = 0,
    CreditCheckInProgress = 1,
    AwaitingManualApproval = 2,
    CompletedApproved = 3,
    CompletedRejected = 4,
    CompletedCancelled = 5
}

public sealed record OrderSagaDto(
    Guid OrderId,
    string OrderNumber,
    Guid DealerId,
    OrderSagaState CurrentState,
    DateTime StartedAtUtc,
    DateTime UpdatedAtUtc,
    DateTime? CompletedAtUtc,
    string? LastMessage);

public sealed record OrderLineDto(
    Guid OrderLineId,
    Guid ProductId,
    string ProductName,
    string Sku,
    int Quantity,
    decimal UnitPrice,
    decimal LineTotal);

public sealed record OrderStatusHistoryDto(
    Guid HistoryId,
    OrderStatus FromStatus,
    OrderStatus ToStatus,
    Guid ChangedByUserId,
    string ChangedByRole,
    DateTime ChangedAtUtc);

public sealed record ReturnInfoDto(
    Guid ReturnRequestId,
    string Reason,
    DateTime RequestedAtUtc,
    bool IsApproved,
    bool IsRejected,
    DateTime? ReviewedAtUtc);

public sealed record OrderDto(
    Guid OrderId,
    string OrderNumber,
    Guid DealerId,
    OrderStatus Status,
    CreditHoldStatus CreditHoldStatus,
    PaymentMode PaymentMode,
    decimal TotalAmount,
    DateTime PlacedAtUtc,
    string? CancellationReason,
    IReadOnlyList<OrderLineDto> Lines,
    IReadOnlyList<OrderStatusHistoryDto> StatusHistory,
    ReturnInfoDto? ReturnRequest,
    OrderSagaDto? Saga);

public sealed record OrderListItemDto(
    Guid OrderId,
    string OrderNumber,
    Guid DealerId,
    OrderStatus Status,
    decimal TotalAmount,
    DateTime PlacedAtUtc);

public sealed record DealerPurchaseStatDto(
    Guid DealerId,
    int OrderCount,
    decimal TotalAmount);

public sealed record ProductPurchaseStatDto(
    Guid ProductId,
    string ProductName,
    string Sku,
    int UnitsSold,
    decimal Revenue);

public sealed record DailyRevenuePointDto(
    DateTime DayUtc,
    int OrderCount,
    decimal Revenue);

public sealed record OrderAnalyticsDto(
    DateTime FromUtc,
    DateTime ToUtc,
    int TotalOrders,
    decimal TotalRevenue,
    decimal AverageOrderValue,
    int UniqueDealers,
    int UnitsSold,
    IReadOnlyList<DealerPurchaseStatDto> TopDealers,
    IReadOnlyList<ProductPurchaseStatDto> TopProducts,
    IReadOnlyList<DailyRevenuePointDto> DailyRevenue);

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int TotalCount, int Page, int PageSize);
