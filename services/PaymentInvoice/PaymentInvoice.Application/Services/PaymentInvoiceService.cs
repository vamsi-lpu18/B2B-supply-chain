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
        if (invoices.Count == 0)
        {
            await SeedDemoInvoicesAsync(dealerId, cancellationToken);
            invoices = await paymentRepository.GetDealerInvoicesAsync(dealerId, cancellationToken);
        }

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

    public async Task<InvoiceWorkflowStateDto?> GetInvoiceWorkflowAsync(Guid invoiceId, CancellationToken cancellationToken)
    {
        var invoice = await paymentRepository.GetInvoiceByIdAsync(invoiceId, cancellationToken);
        if (invoice is null)
        {
            return null;
        }

        var workflow = await paymentRepository.GetInvoiceWorkflowAsync(invoiceId, cancellationToken);
        if (workflow is null)
        {
            workflow = InvoiceWorkflowState.CreateDefault(invoiceId, invoice.CreatedAtUtc);
            await paymentRepository.UpsertInvoiceWorkflowAsync(workflow, cancellationToken);
            await paymentRepository.SaveChangesAsync(cancellationToken);
        }

        return MapWorkflow(workflow);
    }

    public async Task<IReadOnlyList<InvoiceWorkflowStateDto>> GetDealerInvoiceWorkflowsAsync(Guid dealerId, CancellationToken cancellationToken)
    {
        var invoices = await paymentRepository.GetDealerInvoicesAsync(dealerId, cancellationToken);
        if (invoices.Count == 0)
        {
            return [];
        }

        var invoiceById = invoices.ToDictionary(x => x.InvoiceId);
        var workflows = await paymentRepository.GetDealerInvoiceWorkflowsAsync(dealerId, cancellationToken);
        var workflowByInvoiceId = workflows.ToDictionary(x => x.InvoiceId);
        var createdAny = false;

        foreach (var invoice in invoices)
        {
            if (workflowByInvoiceId.ContainsKey(invoice.InvoiceId))
            {
                continue;
            }

            var created = InvoiceWorkflowState.CreateDefault(invoice.InvoiceId, invoice.CreatedAtUtc);
            await paymentRepository.UpsertInvoiceWorkflowAsync(created, cancellationToken);
            workflowByInvoiceId[invoice.InvoiceId] = created;
            createdAny = true;
        }

        if (createdAny)
        {
            await paymentRepository.SaveChangesAsync(cancellationToken);
        }

        var ordered = workflowByInvoiceId.Values
            .OrderByDescending(x => invoiceById[x.InvoiceId].CreatedAtUtc)
            .Select(MapWorkflow)
            .ToList();

        return ordered;
    }

    public async Task<InvoiceWorkflowStateDto?> UpsertInvoiceWorkflowAsync(Guid invoiceId, UpsertInvoiceWorkflowRequest request, CancellationToken cancellationToken)
    {
        var invoice = await paymentRepository.GetInvoiceByIdAsync(invoiceId, cancellationToken);
        if (invoice is null)
        {
            return null;
        }

        var current = await paymentRepository.GetInvoiceWorkflowAsync(invoiceId, cancellationToken)
            ?? InvoiceWorkflowState.CreateDefault(invoiceId, invoice.CreatedAtUtc);

        var normalizedStatus = ParseWorkflowStatus(request.Status);
        var normalizedDueAtUtc = NormalizeUtc(request.DueAtUtc, invoice.CreatedAtUtc.AddDays(7));
        var normalizedPromiseToPayAtUtc = NormalizeOptionalUtc(request.PromiseToPayAtUtc);
        var normalizedNextFollowUpAtUtc = NormalizeOptionalUtc(request.NextFollowUpAtUtc);
        var normalizedInternalNote = NormalizeText(request.InternalNote, 500);
        var normalizedReminderCount = Math.Clamp(request.ReminderCount, 0, 99);
        var normalizedLastReminderAtUtc = NormalizeOptionalUtc(request.LastReminderAtUtc);

        current.Update(
            normalizedStatus,
            normalizedDueAtUtc,
            normalizedPromiseToPayAtUtc,
            normalizedNextFollowUpAtUtc,
            normalizedInternalNote,
            normalizedReminderCount,
            normalizedLastReminderAtUtc);

        await paymentRepository.UpsertInvoiceWorkflowAsync(current, cancellationToken);
        await paymentRepository.SaveChangesAsync(cancellationToken);

        return MapWorkflow(current);
    }

    public async Task<IReadOnlyList<InvoiceWorkflowActivityDto>> GetInvoiceWorkflowActivitiesAsync(Guid invoiceId, CancellationToken cancellationToken)
    {
        var invoice = await paymentRepository.GetInvoiceByIdAsync(invoiceId, cancellationToken);
        if (invoice is null)
        {
            return [];
        }

        var items = await paymentRepository.GetInvoiceWorkflowActivitiesAsync(invoiceId, cancellationToken);
        return items.Select(MapWorkflowActivity).ToList();
    }

    public async Task<InvoiceWorkflowActivityDto?> AddInvoiceWorkflowActivityAsync(Guid invoiceId, AddInvoiceWorkflowActivityRequest request, CancellationToken cancellationToken)
    {
        var invoice = await paymentRepository.GetInvoiceByIdAsync(invoiceId, cancellationToken);
        if (invoice is null)
        {
            return null;
        }

        var activity = InvoiceWorkflowActivity.Create(
            invoiceId,
            ParseWorkflowActivityType(request.Type),
            NormalizeText(request.Message, 300),
            NormalizeRole(request.CreatedByRole));

        await paymentRepository.AddInvoiceWorkflowActivityAsync(activity, cancellationToken);
        await paymentRepository.SaveChangesAsync(cancellationToken);

        return MapWorkflowActivity(activity);
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

    private static InvoiceWorkflowStateDto MapWorkflow(InvoiceWorkflowState state)
    {
        return new InvoiceWorkflowStateDto(
            state.InvoiceId,
            ToWorkflowStatusText(state.Status),
            state.DueAtUtc,
            state.PromiseToPayAtUtc,
            state.NextFollowUpAtUtc,
            state.InternalNote,
            state.ReminderCount,
            state.LastReminderAtUtc,
            state.UpdatedAtUtc);
    }

    private static InvoiceWorkflowActivityDto MapWorkflowActivity(InvoiceWorkflowActivity activity)
    {
        return new InvoiceWorkflowActivityDto(
            activity.ActivityId,
            activity.InvoiceId,
            ToWorkflowActivityTypeText(activity.Type),
            activity.Message,
            activity.CreatedByRole,
            activity.CreatedAtUtc);
    }

    private static InvoiceWorkflowStatus ParseWorkflowStatus(string? value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "pending" => InvoiceWorkflowStatus.Pending,
            "reminder-sent" => InvoiceWorkflowStatus.ReminderSent,
            "promise-to-pay" => InvoiceWorkflowStatus.PromiseToPay,
            "paid" => InvoiceWorkflowStatus.Paid,
            "disputed" => InvoiceWorkflowStatus.Disputed,
            "escalated" => InvoiceWorkflowStatus.Escalated,
            _ => InvoiceWorkflowStatus.Pending
        };
    }

    private static string ToWorkflowStatusText(InvoiceWorkflowStatus value)
    {
        return value switch
        {
            InvoiceWorkflowStatus.Pending => "pending",
            InvoiceWorkflowStatus.ReminderSent => "reminder-sent",
            InvoiceWorkflowStatus.PromiseToPay => "promise-to-pay",
            InvoiceWorkflowStatus.Paid => "paid",
            InvoiceWorkflowStatus.Disputed => "disputed",
            InvoiceWorkflowStatus.Escalated => "escalated",
            _ => "pending"
        };
    }

    private static InvoiceWorkflowActivityType ParseWorkflowActivityType(string? value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "workflow-saved" => InvoiceWorkflowActivityType.WorkflowSaved,
            "reminder-sent" => InvoiceWorkflowActivityType.ReminderSent,
            "promise-to-pay" => InvoiceWorkflowActivityType.PromiseToPay,
            "marked-paid" => InvoiceWorkflowActivityType.MarkedPaid,
            "marked-disputed" => InvoiceWorkflowActivityType.MarkedDisputed,
            "escalated" => InvoiceWorkflowActivityType.Escalated,
            "auto-follow-up" => InvoiceWorkflowActivityType.AutoFollowUp,
            _ => InvoiceWorkflowActivityType.WorkflowSaved
        };
    }

    private static string ToWorkflowActivityTypeText(InvoiceWorkflowActivityType value)
    {
        return value switch
        {
            InvoiceWorkflowActivityType.WorkflowSaved => "workflow-saved",
            InvoiceWorkflowActivityType.ReminderSent => "reminder-sent",
            InvoiceWorkflowActivityType.PromiseToPay => "promise-to-pay",
            InvoiceWorkflowActivityType.MarkedPaid => "marked-paid",
            InvoiceWorkflowActivityType.MarkedDisputed => "marked-disputed",
            InvoiceWorkflowActivityType.Escalated => "escalated",
            InvoiceWorkflowActivityType.AutoFollowUp => "auto-follow-up",
            _ => "workflow-saved"
        };
    }

    private static DateTime NormalizeUtc(DateTime value, DateTime fallbackUtc)
    {
        if (value == default)
        {
            return fallbackUtc.Kind == DateTimeKind.Utc ? fallbackUtc : fallbackUtc.ToUniversalTime();
        }

        return value.Kind == DateTimeKind.Utc ? value : value.ToUniversalTime();
    }

    private static DateTime? NormalizeOptionalUtc(DateTime? value)
    {
        if (value is null || value == default)
        {
            return null;
        }

        return value.Value.Kind == DateTimeKind.Utc ? value.Value : value.Value.ToUniversalTime();
    }

    private async Task SeedDemoInvoicesAsync(Guid dealerId, CancellationToken cancellationToken)
    {
        // These demo invoices are created only when a dealer has no invoices,
        // so invoice screens are usable out of the box in local/demo environments.
        var requests = BuildDemoInvoiceRequests(dealerId);
        foreach (var request in requests)
        {
            await GenerateInvoiceAsync(request, cancellationToken);
        }
    }

    private static IReadOnlyList<GenerateInvoiceRequest> BuildDemoInvoiceRequests(Guid dealerId)
    {
        return
        [
            new GenerateInvoiceRequest(
                Guid.NewGuid(),
                dealerId,
                true,
                PaymentMode.PrePaid,
                [
                    new InvoiceLineInput(Guid.NewGuid(), "Industrial Tablet 10 inch", "ELE-101", "84713010", 2, 28999m),
                    new InvoiceLineInput(Guid.NewGuid(), "Managed 24-Port Switch", "NET-401", "85176290", 1, 12499m)
                ]),

            new GenerateInvoiceRequest(
                Guid.NewGuid(),
                dealerId,
                false,
                PaymentMode.COD,
                [
                    new InvoiceLineInput(Guid.NewGuid(), "Hydraulic Pump Seal Kit", "SPR-201", "84849000", 4, 1399m),
                    new InvoiceLineInput(Guid.NewGuid(), "Arc-Flash Safety Gloves", "GLV-003", "61161000", 6, 699m)
                ]),

            new GenerateInvoiceRequest(
                Guid.NewGuid(),
                dealerId,
                true,
                PaymentMode.PrePaid,
                [
                    new InvoiceLineInput(Guid.NewGuid(), "Rackmount Compute Node", "CPU-301", "84715000", 1, 84999m),
                    new InvoiceLineInput(Guid.NewGuid(), "Memory Module 32GB", "RAM-332", "84733020", 4, 4599m)
                ]),

            new GenerateInvoiceRequest(
                Guid.NewGuid(),
                dealerId,
                false,
                PaymentMode.COD,
                [
                    new InvoiceLineInput(Guid.NewGuid(), "PLC I/O Expansion Module", "AUT-501", "85371000", 2, 9899m),
                    new InvoiceLineInput(Guid.NewGuid(), "Copper Power Cable 10m", "CBL-001", "85444999", 5, 1899m)
                ])
        ];
    }

    private static string NormalizeText(string? value, int maxLength)
    {
        var normalized = (value ?? string.Empty).Trim();
        if (normalized.Length <= maxLength)
        {
            return normalized;
        }

        return normalized[..maxLength];
    }

    private static string NormalizeRole(string? value)
    {
        var role = string.IsNullOrWhiteSpace(value) ? "System" : value.Trim();
        if (role.Length <= 40)
        {
            return role;
        }

        return role[..40];
    }
}
