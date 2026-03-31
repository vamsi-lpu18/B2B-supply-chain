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

public sealed record ReturnRequestDto(string Reason);

public sealed record AdminDecisionRequest(string? Reason);

public sealed record CreditCheckResult(bool Approved, decimal AvailableCredit, decimal CreditLimit, decimal CurrentOutstanding);

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
    ReturnInfoDto? ReturnRequest);

public sealed record OrderListItemDto(
    Guid OrderId,
    string OrderNumber,
    Guid DealerId,
    OrderStatus Status,
    decimal TotalAmount,
    DateTime PlacedAtUtc);

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int TotalCount, int Page, int PageSize);
