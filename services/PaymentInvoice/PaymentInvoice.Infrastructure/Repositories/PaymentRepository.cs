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
