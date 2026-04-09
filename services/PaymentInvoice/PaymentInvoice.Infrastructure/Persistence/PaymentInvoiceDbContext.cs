using BuildingBlocks.Persistence;
using Microsoft.EntityFrameworkCore;
using PaymentInvoice.Domain.Entities;

namespace PaymentInvoice.Infrastructure.Persistence;

public sealed class PaymentInvoiceDbContext(DbContextOptions<PaymentInvoiceDbContext> options) : DbContext(options), IApplicationDbContext
{
    public DbSet<DealerCreditAccount> DealerCreditAccounts => Set<DealerCreditAccount>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<InvoiceLine> InvoiceLines => Set<InvoiceLine>();
    public DbSet<InvoiceWorkflowState> InvoiceWorkflowStates => Set<InvoiceWorkflowState>();
    public DbSet<InvoiceWorkflowActivity> InvoiceWorkflowActivities => Set<InvoiceWorkflowActivity>();
    public DbSet<PaymentRecord> PaymentRecords => Set<PaymentRecord>();
    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<DealerCreditAccount>(builder =>
        {
            builder.ToTable("DealerCreditAccounts");
            builder.HasKey(x => x.AccountId);
            builder.HasIndex(x => x.DealerId).IsUnique();
            builder.Property(x => x.CreditLimit).HasPrecision(18, 2);
            builder.Property(x => x.CurrentOutstanding).HasPrecision(18, 2);
            builder.Ignore(x => x.AvailableCredit);
        });

        modelBuilder.Entity<Invoice>(builder =>
        {
            builder.ToTable("Invoices");
            builder.HasKey(x => x.InvoiceId);
            builder.Property(x => x.InvoiceNumber).HasMaxLength(40).IsRequired();
            builder.HasIndex(x => x.InvoiceNumber).IsUnique();
            builder.Property(x => x.IdempotencyKey).HasMaxLength(64).IsRequired();
            builder.HasIndex(x => x.IdempotencyKey).IsUnique();
            builder.Property(x => x.GstType).HasConversion<string>().HasMaxLength(20).IsRequired();
            builder.Property(x => x.GstRate).HasPrecision(6, 2);
            builder.Property(x => x.Subtotal).HasPrecision(18, 2);
            builder.Property(x => x.GstAmount).HasPrecision(18, 2);
            builder.Property(x => x.GrandTotal).HasPrecision(18, 2);
            builder.Property(x => x.PdfStoragePath).HasMaxLength(500);
            builder.HasMany(x => x.Lines)
                .WithOne()
                .HasForeignKey(x => x.InvoiceId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<InvoiceLine>(builder =>
        {
            builder.ToTable("InvoiceLines");
            builder.HasKey(x => x.InvoiceLineId);
            builder.Property(x => x.ProductName).HasMaxLength(220).IsRequired();
            builder.Property(x => x.Sku).HasMaxLength(60).IsRequired();
            builder.Property(x => x.HsnCode).HasMaxLength(20).IsRequired();
            builder.Property(x => x.UnitPrice).HasPrecision(18, 2);
            builder.Ignore(x => x.LineTotal);
        });

        modelBuilder.Entity<InvoiceWorkflowState>(builder =>
        {
            builder.ToTable("InvoiceWorkflowStates");
            builder.HasKey(x => x.InvoiceId);
            builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32).IsRequired();
            builder.Property(x => x.DueAtUtc).IsRequired();
            builder.Property(x => x.InternalNote).HasMaxLength(500).IsRequired();
            builder.Property(x => x.ReminderCount).IsRequired();
            builder.Property(x => x.UpdatedAtUtc).IsRequired();
            builder.HasOne<Invoice>()
                .WithOne()
                .HasForeignKey<InvoiceWorkflowState>(x => x.InvoiceId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<InvoiceWorkflowActivity>(builder =>
        {
            builder.ToTable("InvoiceWorkflowActivities");
            builder.HasKey(x => x.ActivityId);
            builder.Property(x => x.Type).HasConversion<string>().HasMaxLength(32).IsRequired();
            builder.Property(x => x.Message).HasMaxLength(300).IsRequired();
            builder.Property(x => x.CreatedByRole).HasMaxLength(40).IsRequired();
            builder.Property(x => x.CreatedAtUtc).IsRequired();
            builder.HasIndex(x => new { x.InvoiceId, x.CreatedAtUtc });
            builder.HasOne<Invoice>()
                .WithMany()
                .HasForeignKey(x => x.InvoiceId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PaymentRecord>(builder =>
        {
            builder.ToTable("PaymentRecords");
            builder.HasKey(x => x.PaymentRecordId);
            builder.Property(x => x.PaymentMode).HasConversion<string>().HasMaxLength(20).IsRequired();
            builder.Property(x => x.Amount).HasPrecision(18, 2);
            builder.Property(x => x.ReferenceNo).HasMaxLength(100);
        });

        modelBuilder.Entity<OutboxMessage>(builder =>
        {
            builder.ToTable("OutboxMessages");
            builder.HasKey(x => x.MessageId);
            builder.Property(x => x.EventType).HasMaxLength(200).IsRequired();
            builder.Property(x => x.Payload).IsRequired();
            builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            builder.Property(x => x.Error).HasMaxLength(2000);
        });

        base.OnModelCreating(modelBuilder);
    }
}
