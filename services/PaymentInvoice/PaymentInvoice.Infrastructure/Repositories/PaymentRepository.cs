using BuildingBlocks.Persistence;
using Microsoft.EntityFrameworkCore;
using PaymentInvoice.Application.Abstractions;
using PaymentInvoice.Domain.Entities;
using PaymentInvoice.Infrastructure.Persistence;
using System.Text.Json;

namespace PaymentInvoice.Infrastructure.Repositories;

internal sealed class PaymentRepository(PaymentInvoiceDbContext dbContext) : IPaymentRepository
{
    public Task<DealerCreditAccount?> GetDealerAccountAsync(Guid dealerId, CancellationToken cancellationToken)
    {
        return dbContext.DealerCreditAccounts.FirstOrDefaultAsync(x => x.DealerId == dealerId, cancellationToken);
    }

    public async Task AddDealerAccountAsync(DealerCreditAccount account, CancellationToken cancellationToken)
    {
        await dbContext.DealerCreditAccounts.AddAsync(account, cancellationToken);
    }

    public Task<Invoice?> GetInvoiceByIdAsync(Guid invoiceId, CancellationToken cancellationToken)
    {
        return dbContext.Invoices
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.InvoiceId == invoiceId, cancellationToken);
    }

    public Task<Invoice?> GetInvoiceByIdempotencyKeyAsync(string idempotencyKey, CancellationToken cancellationToken)
    {
        return dbContext.Invoices
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.IdempotencyKey == idempotencyKey, cancellationToken);
    }

    public async Task<IReadOnlyList<Invoice>> GetDealerInvoicesAsync(Guid dealerId, CancellationToken cancellationToken)
    {
        var invoices = await dbContext.Invoices
            .AsNoTracking()
            .Include(x => x.Lines)
            .Where(x => x.DealerId == dealerId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return invoices;
    }

    public Task<InvoiceWorkflowState?> GetInvoiceWorkflowAsync(Guid invoiceId, CancellationToken cancellationToken)
    {
        return dbContext.InvoiceWorkflowStates
            .FirstOrDefaultAsync(x => x.InvoiceId == invoiceId, cancellationToken);
    }

    public async Task<IReadOnlyList<InvoiceWorkflowState>> GetDealerInvoiceWorkflowsAsync(Guid dealerId, CancellationToken cancellationToken)
    {
        var workflows = await dbContext.InvoiceWorkflowStates
            .AsNoTracking()
            .Join(
                dbContext.Invoices.AsNoTracking(),
                workflow => workflow.InvoiceId,
                invoice => invoice.InvoiceId,
                (workflow, invoice) => new { workflow, invoice.DealerId })
            .Where(x => x.DealerId == dealerId)
            .Select(x => x.workflow)
            .ToListAsync(cancellationToken);

        return workflows;
    }

    public async Task UpsertInvoiceWorkflowAsync(InvoiceWorkflowState workflowState, CancellationToken cancellationToken)
    {
        var existing = await dbContext.InvoiceWorkflowStates
            .FirstOrDefaultAsync(x => x.InvoiceId == workflowState.InvoiceId, cancellationToken);

        if (existing is null)
        {
            await dbContext.InvoiceWorkflowStates.AddAsync(workflowState, cancellationToken);
            return;
        }

        dbContext.Entry(existing).CurrentValues.SetValues(workflowState);
    }

    public async Task<IReadOnlyList<InvoiceWorkflowActivity>> GetInvoiceWorkflowActivitiesAsync(Guid invoiceId, CancellationToken cancellationToken)
    {
        var activities = await dbContext.InvoiceWorkflowActivities
            .AsNoTracking()
            .Where(x => x.InvoiceId == invoiceId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return activities;
    }

    public async Task AddInvoiceWorkflowActivityAsync(InvoiceWorkflowActivity activity, CancellationToken cancellationToken)
    {
        await dbContext.InvoiceWorkflowActivities.AddAsync(activity, cancellationToken);
    }

    public async Task AddInvoiceAsync(Invoice invoice, CancellationToken cancellationToken)
    {
        await dbContext.Invoices.AddAsync(invoice, cancellationToken);
    }

    public async Task AddPaymentRecordAsync(PaymentRecord record, CancellationToken cancellationToken)
    {
        await dbContext.PaymentRecords.AddAsync(record, cancellationToken);
    }

    public async Task AddOutboxMessageAsync(string eventType, object payload, CancellationToken cancellationToken)
    {
        var outbox = new OutboxMessage
        {
            MessageId = Guid.NewGuid(),
            EventType = eventType,
            Payload = JsonSerializer.Serialize(payload),
            Status = OutboxStatus.Pending,
            CreatedAtUtc = DateTime.UtcNow
        };

        await dbContext.OutboxMessages.AddAsync(outbox, cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        return dbContext.SaveChangesAsync(cancellationToken);
    }
}
