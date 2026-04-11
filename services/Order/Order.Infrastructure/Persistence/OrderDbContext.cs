using BuildingBlocks.Persistence;
using Microsoft.EntityFrameworkCore;
using Order.Domain.Entities;

namespace Order.Infrastructure.Persistence;

public sealed class OrderDbContext(DbContextOptions<OrderDbContext> options) : DbContext(options), IApplicationDbContext
{
    public DbSet<OrderAggregate> Orders => Set<OrderAggregate>();
    public DbSet<OrderLine> OrderLines => Set<OrderLine>();
    public DbSet<OrderStatusHistory> OrderStatusHistories => Set<OrderStatusHistory>();
    public DbSet<ReturnRequest> ReturnRequests => Set<ReturnRequest>();
    public DbSet<OrderSagaStateEntity> OrderSagaStates => Set<OrderSagaStateEntity>();
    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<OutboxMessage>(builder =>
        {
            builder.ToTable("OutboxMessages");
            builder.HasKey(x => x.MessageId);
            builder.Property(x => x.EventType).HasMaxLength(200).IsRequired();
            builder.Property(x => x.Payload).IsRequired();
            builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            builder.Property(x => x.Error).HasMaxLength(2000);
        });

        modelBuilder.Entity<OrderAggregate>(builder =>
        {
            builder.ToTable("Orders");
            builder.HasKey(x => x.OrderId);
            builder.Property(x => x.OrderNumber).HasMaxLength(32).IsRequired();
            builder.HasIndex(x => x.OrderNumber).IsUnique();
            builder.HasIndex(x => new { x.DealerId, x.PlacedAtUtc });
            builder.HasIndex(x => new { x.Status, x.PlacedAtUtc });
            builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(40).IsRequired();
            builder.Property(x => x.CreditHoldStatus).HasConversion<string>().HasMaxLength(40).IsRequired();
            builder.Property(x => x.PaymentMode).HasConversion<string>().HasMaxLength(20).IsRequired();
            builder.Property(x => x.TotalAmount).HasPrecision(18, 2);
            builder.Property(x => x.CancellationReason).HasMaxLength(400);
            builder.HasMany(x => x.Lines)
                .WithOne()
                .HasForeignKey(x => x.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
            builder.HasMany(x => x.StatusHistory)
                .WithOne()
                .HasForeignKey(x => x.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
            builder.HasOne(x => x.ReturnRequest)
                .WithOne()
                .HasForeignKey<ReturnRequest>(x => x.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<OrderLine>(builder =>
        {
            builder.ToTable("OrderLines");
            builder.HasKey(x => x.OrderLineId);
            builder.Property(x => x.ProductName).HasMaxLength(220).IsRequired();
            builder.Property(x => x.Sku).HasMaxLength(60).IsRequired();
            builder.Property(x => x.UnitPrice).HasPrecision(18, 2);
            builder.Ignore(x => x.LineTotal);
        });

        modelBuilder.Entity<OrderStatusHistory>(builder =>
        {
            builder.ToTable("OrderStatusHistory");
            builder.HasKey(x => x.HistoryId);
            builder.Property(x => x.FromStatus).HasConversion<string>().HasMaxLength(40).IsRequired();
            builder.Property(x => x.ToStatus).HasConversion<string>().HasMaxLength(40).IsRequired();
            builder.Property(x => x.ChangedByRole).HasMaxLength(40).IsRequired();
        });

        modelBuilder.Entity<ReturnRequest>(builder =>
        {
            builder.ToTable("ReturnRequests");
            builder.HasKey(x => x.ReturnRequestId);
            builder.Property(x => x.Reason).HasMaxLength(500).IsRequired();
        });

        modelBuilder.Entity<OrderSagaStateEntity>(builder =>
        {
            builder.ToTable("OrderSagaStates");
            builder.HasKey(x => x.OrderId);
            builder.Property(x => x.OrderNumber).HasMaxLength(32).IsRequired();
            builder.Property(x => x.CurrentState).HasConversion<string>().HasMaxLength(64).IsRequired();
            builder.Property(x => x.LastMessage).HasMaxLength(500);
        });

        base.OnModelCreating(modelBuilder);
    }
}
