using BuildingBlocks.Persistence;
using LogisticsTracking.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace LogisticsTracking.Infrastructure.Persistence;

public sealed class LogisticsTrackingDbContext(DbContextOptions<LogisticsTrackingDbContext> options) : DbContext(options), IApplicationDbContext
{
    public DbSet<Shipment> Shipments => Set<Shipment>();
    public DbSet<ShipmentEvent> ShipmentEvents => Set<ShipmentEvent>();
    public DbSet<ShipmentOpsState> ShipmentOpsStates => Set<ShipmentOpsState>();
    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Shipment>(builder =>
        {
            builder.ToTable("Shipments");
            builder.HasKey(x => x.ShipmentId);
            builder.Property(x => x.ShipmentNumber).HasMaxLength(32).IsRequired();
            builder.HasIndex(x => x.ShipmentNumber).IsUnique();
            builder.Property(x => x.DeliveryAddress).HasMaxLength(500).IsRequired();
            builder.Property(x => x.City).HasMaxLength(100).IsRequired();
            builder.Property(x => x.State).HasMaxLength(100).IsRequired();
            builder.Property(x => x.PostalCode).HasMaxLength(12).IsRequired();
            builder.Property(x => x.VehicleNumber).HasMaxLength(32);
            builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32).IsRequired();
            builder.HasMany(x => x.Events)
                .WithOne()
                .HasForeignKey(x => x.ShipmentId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ShipmentEvent>(builder =>
        {
            builder.ToTable("ShipmentEvents");
            builder.HasKey(x => x.ShipmentEventId);
            builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32).IsRequired();
            builder.Property(x => x.Note).HasMaxLength(500).IsRequired();
            builder.Property(x => x.UpdatedByRole).HasMaxLength(40).IsRequired();
        });

        modelBuilder.Entity<ShipmentOpsState>(builder =>
        {
            builder.ToTable("ShipmentOpsStates");
            builder.HasKey(x => x.ShipmentId);
            builder.Property(x => x.HandoverState).HasConversion<string>().HasMaxLength(20).IsRequired();
            builder.Property(x => x.HandoverExceptionReason).HasMaxLength(300);
            builder.Property(x => x.RetryRequired).IsRequired();
            builder.Property(x => x.RetryCount).IsRequired();
            builder.Property(x => x.RetryReason).HasMaxLength(300);
            builder.Property(x => x.UpdatedAtUtc).IsRequired();
            builder.HasOne<Shipment>()
                .WithOne()
                .HasForeignKey<ShipmentOpsState>(x => x.ShipmentId)
                .OnDelete(DeleteBehavior.Cascade);
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
