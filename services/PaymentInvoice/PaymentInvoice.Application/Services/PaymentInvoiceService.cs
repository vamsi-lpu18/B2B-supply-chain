using FluentValidation;
using PaymentInvoice.Application.Abstractions;
using PaymentInvoice.Application.DTOs;
using PaymentInvoice.Domain.Entities;
using PaymentInvoice.Domain.Enums;
using System.Security.Cryptography;
using System.Text;

namespace PaymentInvoice.Application.Services;

public sealed class PaymentInvoiceService(
    IPaymentRepository paymentRepository,
    IInvoicePdfGenerator invoicePdfGenerator,
    IExternalPaymentGateway externalPaymentGateway,
    IValidator<UpdateCreditLimitRequest> updateLimitValidator,
    IValidator<GenerateInvoiceRequest> generateInvoiceValidator,
    IValidator<SettleOutstandingRequest> settleOutstandingValidator,
    IValidator<CreateGatewayOrderRequest> createGatewayOrderValidator,
    IValidator<VerifyGatewayPaymentRequest> verifyGatewayPaymentValidator)
    : IPaymentInvoiceService
{
    public async Task<DealerCreditAccountDto> EnsureDealerAccountAsync(Guid dealerId, decimal? initialLimit, CancellationToken cancellationToken)
    {
        var account = await paymentRepository.GetDealerAccountAsync(dealerId, cancellationToken);
        if (account is null)
        {
            account = DealerCreditAccount.Create(dealerId, initialLimit);
            await paymentRepository.AddDealerAccountAsync(account, cancellationToken);
            await paymentRepository.SaveChangesAsync(cancellationToken);
        }

        return MapAccount(account);
    }

    public async Task<CreditCheckResponse> CheckCreditAsync(Guid dealerId, decimal amount, CancellationToken cancellationToken)
    {
        var account = await paymentRepository.GetDealerAccountAsync(dealerId, cancellationToken);
        if (account is null)
        {
            account = DealerCreditAccount.Create(dealerId);
            await paymentRepository.AddDealerAccountAsync(account, cancellationToken);
            await paymentRepository.SaveChangesAsync(cancellationToken);
        }

        var approved = account.AvailableCredit >= amount;
        return new CreditCheckResponse(approved, account.AvailableCredit, account.CreditLimit, account.CurrentOutstanding);
    }

    public async Task<DealerCreditAccountDto?> UpdateCreditLimitAsync(Guid dealerId, decimal creditLimit, CancellationToken cancellationToken)
    {
        await updateLimitValidator.ValidateAndThrowAsync(new UpdateCreditLimitRequest(creditLimit), cancellationToken);

        var account = await paymentRepository.GetDealerAccountAsync(dealerId, cancellationToken);
        if (account is null)
        {
            account = DealerCreditAccount.Create(dealerId, creditLimit);
            await paymentRepository.AddDealerAccountAsync(account, cancellationToken);
        }
        else
        {
            account.UpdateCreditLimit(creditLimit);
        }

        await paymentRepository.AddOutboxMessageAsync("DealerCreditLimitUpdated", new
        {
            dealerId,
            creditLimit,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        await paymentRepository.SaveChangesAsync(cancellationToken);
        return MapAccount(account);
    }

    public async Task<InvoiceDto> GenerateInvoiceAsync(GenerateInvoiceRequest request, CancellationToken cancellationToken)
    {
        await generateInvoiceValidator.ValidateAndThrowAsync(request, cancellationToken);

        var idempotencyKey = ComputeIdempotencyKey(request.OrderId, request.DealerId);
        var existing = await paymentRepository.GetInvoiceByIdempotencyKeyAsync(idempotencyKey, cancellationToken);
        if (existing is not null)
        {
            return MapInvoice(existing);
        }

        var invoice = Invoice.Create(
            request.OrderId,
            request.DealerId,
            GenerateInvoiceNumber(),
            idempotencyKey,
            request.IsInterstate);

        foreach (var line in request.Lines)
        {
            invoice.AddLine(line.ProductId, line.ProductName, line.Sku, line.HsnCode, line.Quantity, line.UnitPrice);
        }

        var pdfPath = await invoicePdfGenerator.GenerateAsync(invoice, cancellationToken);
        invoice.SetPdfPath(pdfPath);

        var account = await paymentRepository.GetDealerAccountAsync(request.DealerId, cancellationToken);
        if (account is null)
        {
            account = DealerCreditAccount.Create(request.DealerId);
            await paymentRepository.AddDealerAccountAsync(account, cancellationToken);
        }

        account.AddOutstanding(invoice.GrandTotal);

        await paymentRepository.AddInvoiceAsync(invoice, cancellationToken);
        await paymentRepository.AddPaymentRecordAsync(
            PaymentRecord.Create(request.OrderId, request.DealerId, request.PaymentMode, invoice.GrandTotal, null),
            cancellationToken);

        await paymentRepository.AddOutboxMessageAsync("InvoiceGenerated", new
        {
            invoice.InvoiceId,
            invoice.InvoiceNumber,
            invoice.OrderId,
            invoice.DealerId,
            invoice.GrandTotal,
            invoice.PdfStoragePath,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        await paymentRepository.SaveChangesAsync(cancellationToken);

        return MapInvoice(invoice);
    }

    public async Task<InvoiceDto?> GetInvoiceAsync(Guid invoiceId, CancellationToken cancellationToken)
    {
        var invoice = await paymentRepository.GetInvoiceByIdAsync(invoiceId, cancellationToken);
        return invoice is null ? null : MapInvoice(invoice);
    }

    public async Task<IReadOnlyList<InvoiceDto>> GetDealerInvoicesAsync(Guid dealerId, CancellationToken cancellationToken)
    {
        var invoices = await paymentRepository.GetDealerInvoicesAsync(dealerId, cancellationToken);
        return invoices.Select(MapInvoice).ToList();
    }

    public async Task<DealerCreditAccountDto?> SettleOutstandingAsync(Guid dealerId, decimal amount, string? referenceNo, CancellationToken cancellationToken)
    {
        await settleOutstandingValidator.ValidateAndThrowAsync(new SettleOutstandingRequest(amount, referenceNo), cancellationToken);

        var account = await paymentRepository.GetDealerAccountAsync(dealerId, cancellationToken);
        if (account is null)
        {
            return null;
        }

        account.ReduceOutstanding(amount);

        await paymentRepository.AddPaymentRecordAsync(
            PaymentRecord.Create(Guid.Empty, dealerId, PaymentMode.PrePaid, amount, referenceNo),
            cancellationToken);

        await paymentRepository.SaveChangesAsync(cancellationToken);
        return MapAccount(account);
    }

    public async Task<GatewayOrderDto> CreateGatewayOrderAsync(Guid dealerId, CreateGatewayOrderRequest request, CancellationToken cancellationToken)
    {
        await createGatewayOrderValidator.ValidateAndThrowAsync(request, cancellationToken);

        if (!externalPaymentGateway.IsEnabled)
        {
            throw new InvalidOperationException("Payment gateway is disabled.");
        }

        var normalized = request with
        {
            Currency = string.IsNullOrWhiteSpace(request.Currency) ? "INR" : request.Currency.Trim().ToUpperInvariant(),
            Description = string.IsNullOrWhiteSpace(request.Description) ? "Supply Chain order payment" : request.Description.Trim(),
            Receipt = string.IsNullOrWhiteSpace(request.Receipt) ? $"rcpt-{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}"[..36] : request.Receipt.Trim()
        };

        return await externalPaymentGateway.CreateOrderAsync(dealerId, normalized, cancellationToken);
    }

    public async Task<GatewayPaymentVerificationDto> VerifyGatewayPaymentAsync(Guid dealerId, VerifyGatewayPaymentRequest request, CancellationToken cancellationToken)
    {
        await verifyGatewayPaymentValidator.ValidateAndThrowAsync(request, cancellationToken);

        if (!externalPaymentGateway.IsEnabled)
        {
            throw new InvalidOperationException("Payment gateway is disabled.");
        }

        var normalized = request with
        {
            Currency = string.IsNullOrWhiteSpace(request.Currency) ? "INR" : request.Currency.Trim().ToUpperInvariant(),
            Receipt = string.IsNullOrWhiteSpace(request.Receipt) ? null : request.Receipt.Trim(),
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim()
        };

        var result = await externalPaymentGateway.VerifyPaymentAsync(dealerId, normalized, cancellationToken);

        if (result.Verified)
        {
            await paymentRepository.AddPaymentRecordAsync(
                PaymentRecord.Create(Guid.Empty, dealerId, PaymentMode.PrePaid, normalized.Amount, normalized.GatewayPaymentId),
                cancellationToken);

            await paymentRepository.AddOutboxMessageAsync("PaymentCaptured", new
            {
                dealerId,
                normalized.Amount,
                normalized.Currency,
                normalized.GatewayOrderId,
                normalized.GatewayPaymentId,
                occurredAtUtc = DateTime.UtcNow
            }, cancellationToken);
        }
        else
        {
            await paymentRepository.AddOutboxMessageAsync("PaymentFailed", new
            {
                dealerId,
                normalized.Amount,
                normalized.Currency,
                normalized.GatewayOrderId,
                normalized.GatewayPaymentId,
                result.FailureReason,
                occurredAtUtc = DateTime.UtcNow
            }, cancellationToken);
        }

        await paymentRepository.SaveChangesAsync(cancellationToken);
        return result;
    }

    public async Task<string?> GetInvoicePdfPathAsync(Guid invoiceId, CancellationToken cancellationToken)
    {
        var invoice = await paymentRepository.GetInvoiceByIdAsync(invoiceId, cancellationToken);
        return invoice?.PdfStoragePath;
    }

    private static string ComputeIdempotencyKey(Guid orderId, Guid dealerId)
    {
        var input = $"{orderId:N}:{dealerId:N}:invoice-generation";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(hash);
    }

    private static string GenerateInvoiceNumber()
    {
        var year = DateTime.UtcNow.Year;
        var suffix = Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
        return $"INV-{year}-{suffix}";
    }

    private static DealerCreditAccountDto MapAccount(DealerCreditAccount account)
    {
        return new DealerCreditAccountDto(
            account.AccountId,
            account.DealerId,
            account.CreditLimit,
            account.CurrentOutstanding,
            account.AvailableCredit);
    }

    private static InvoiceDto MapInvoice(Invoice invoice)
    {
        var lines = invoice.Lines
            .Select(line => new InvoiceLineDto(
                line.InvoiceLineId,
                line.ProductId,
                line.ProductName,
                line.Sku,
                line.HsnCode,
                line.Quantity,
                line.UnitPrice,
                line.LineTotal))
            .ToList();

        return new InvoiceDto(
            invoice.InvoiceId,
            invoice.InvoiceNumber,
            invoice.OrderId,
            invoice.DealerId,
            invoice.IdempotencyKey,
            invoice.GstType.ToString(),
            invoice.GstRate,
            invoice.Subtotal,
            invoice.GstAmount,
            invoice.GrandTotal,
            invoice.PdfStoragePath,
            invoice.CreatedAtUtc,
            lines);
    }
}
