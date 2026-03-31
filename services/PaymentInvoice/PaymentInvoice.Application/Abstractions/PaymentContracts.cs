using PaymentInvoice.Application.DTOs;
using PaymentInvoice.Domain.Entities;
using PaymentInvoice.Domain.Enums;

namespace PaymentInvoice.Application.Abstractions;

public interface IPaymentInvoiceService
{
    Task<DealerCreditAccountDto> EnsureDealerAccountAsync(Guid dealerId, decimal? initialLimit, CancellationToken cancellationToken);
    Task<CreditCheckResponse> CheckCreditAsync(Guid dealerId, decimal amount, CancellationToken cancellationToken);
    Task<DealerCreditAccountDto?> UpdateCreditLimitAsync(Guid dealerId, decimal creditLimit, CancellationToken cancellationToken);
    Task<InvoiceDto> GenerateInvoiceAsync(GenerateInvoiceRequest request, CancellationToken cancellationToken);
    Task<InvoiceDto?> GetInvoiceAsync(Guid invoiceId, CancellationToken cancellationToken);
    Task<IReadOnlyList<InvoiceDto>> GetDealerInvoicesAsync(Guid dealerId, CancellationToken cancellationToken);
    Task<DealerCreditAccountDto?> SettleOutstandingAsync(Guid dealerId, decimal amount, string? referenceNo, CancellationToken cancellationToken);
    Task<string?> GetInvoicePdfPathAsync(Guid invoiceId, CancellationToken cancellationToken);
    Task<GatewayOrderDto> CreateGatewayOrderAsync(Guid dealerId, CreateGatewayOrderRequest request, CancellationToken cancellationToken);
    Task<GatewayPaymentVerificationDto> VerifyGatewayPaymentAsync(Guid dealerId, VerifyGatewayPaymentRequest request, CancellationToken cancellationToken);
}

public interface IPaymentRepository
{
    Task<DealerCreditAccount?> GetDealerAccountAsync(Guid dealerId, CancellationToken cancellationToken);
    Task AddDealerAccountAsync(DealerCreditAccount account, CancellationToken cancellationToken);
    Task<Invoice?> GetInvoiceByIdAsync(Guid invoiceId, CancellationToken cancellationToken);
    Task<Invoice?> GetInvoiceByIdempotencyKeyAsync(string idempotencyKey, CancellationToken cancellationToken);
    Task<IReadOnlyList<Invoice>> GetDealerInvoicesAsync(Guid dealerId, CancellationToken cancellationToken);
    Task AddInvoiceAsync(Invoice invoice, CancellationToken cancellationToken);
    Task AddPaymentRecordAsync(PaymentRecord record, CancellationToken cancellationToken);
    Task AddOutboxMessageAsync(string eventType, object payload, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}

public interface IInvoicePdfGenerator
{
    Task<string> GenerateAsync(Invoice invoice, CancellationToken cancellationToken);
}

public interface IExternalPaymentGateway
{
    bool IsEnabled { get; }
    Task<GatewayOrderDto> CreateOrderAsync(Guid dealerId, CreateGatewayOrderRequest request, CancellationToken cancellationToken);
    Task<GatewayPaymentVerificationDto> VerifyPaymentAsync(Guid dealerId, VerifyGatewayPaymentRequest request, CancellationToken cancellationToken);
}
