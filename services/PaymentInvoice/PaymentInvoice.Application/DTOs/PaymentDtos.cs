using PaymentInvoice.Domain.Enums;

namespace PaymentInvoice.Application.DTOs;

public sealed record CreditCheckResponse(bool Approved, decimal AvailableCredit, decimal CreditLimit, decimal CurrentOutstanding);

public sealed record UpdateCreditLimitRequest(decimal CreditLimit);

public sealed record SeedDealerAccountRequest(decimal? InitialCreditLimit);

public sealed record SettleOutstandingRequest(decimal Amount, string? ReferenceNo);

public sealed record InvoiceLineInput(
    Guid ProductId,
    string ProductName,
    string Sku,
    string HsnCode,
    int Quantity,
    decimal UnitPrice);

public sealed record GenerateInvoiceRequest(
    Guid OrderId,
    Guid DealerId,
    bool IsInterstate,
    PaymentMode PaymentMode,
    IReadOnlyList<InvoiceLineInput> Lines);

public sealed record InvoiceLineDto(
    Guid InvoiceLineId,
    Guid ProductId,
    string ProductName,
    string Sku,
    string HsnCode,
    int Quantity,
    decimal UnitPrice,
    decimal LineTotal);

public sealed record InvoiceDto(
    Guid InvoiceId,
    string InvoiceNumber,
    Guid OrderId,
    Guid DealerId,
    string IdempotencyKey,
    string GstType,
    decimal GstRate,
    decimal Subtotal,
    decimal GstAmount,
    decimal GrandTotal,
    string PdfStoragePath,
    DateTime CreatedAtUtc,
    IReadOnlyList<InvoiceLineDto> Lines);

public sealed record DealerCreditAccountDto(
    Guid AccountId,
    Guid DealerId,
    decimal CreditLimit,
    decimal CurrentOutstanding,
    decimal AvailableCredit);

public sealed record CreateGatewayOrderRequest(
    decimal Amount,
    string? Currency,
    string? Description,
    string? Receipt);

public sealed record GatewayOrderDto(
    string Provider,
    string KeyId,
    string GatewayOrderId,
    long AmountMinor,
    decimal Amount,
    string Currency,
    string Receipt,
    string Description,
    bool TestMode);

public sealed record VerifyGatewayPaymentRequest(
    string GatewayOrderId,
    string GatewayPaymentId,
    string Signature,
    decimal Amount,
    string? Currency,
    string? Receipt,
    string? Description);

public sealed record GatewayPaymentVerificationDto(
    bool Verified,
    string Provider,
    string GatewayOrderId,
    string GatewayPaymentId,
    string? FailureReason);

public sealed record UpsertInvoiceWorkflowRequest(
    string Status,
    DateTime DueAtUtc,
    DateTime? PromiseToPayAtUtc,
    DateTime? NextFollowUpAtUtc,
    string InternalNote,
    int ReminderCount,
    DateTime? LastReminderAtUtc);

public sealed record InvoiceWorkflowStateDto(
    Guid InvoiceId,
    string Status,
    DateTime DueAtUtc,
    DateTime? PromiseToPayAtUtc,
    DateTime? NextFollowUpAtUtc,
    string InternalNote,
    int ReminderCount,
    DateTime? LastReminderAtUtc,
    DateTime UpdatedAtUtc);

public sealed record AddInvoiceWorkflowActivityRequest(
    string Type,
    string Message,
    string CreatedByRole);

public sealed record InvoiceWorkflowActivityDto(
    Guid ActivityId,
    Guid InvoiceId,
    string Type,
    string Message,
    string CreatedByRole,
    DateTime CreatedAtUtc);
