using BuildingBlocks.Persistence;
using Microsoft.EntityFrameworkCore;
using Notification.Domain.Entities;

namespace Notification.Infrastructure.Persistence;

public sealed class NotificationDbContext(DbContextOptions<NotificationDbContext> options) : DbContext(options), IApplicationDbContext
{
    public DbSet<NotificationMessage> Notifications => Set<NotificationMessage>();
    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<NotificationMessage>(builder =>
        {
            builder.ToTable("Notifications");
            builder.HasKey(x => x.NotificationId);
            builder.Property(x => x.Title).HasMaxLength(180).IsRequired();
            builder.Property(x => x.Body).HasMaxLength(4000).IsRequired();
            builder.Property(x => x.SourceService).HasMaxLength(100).IsRequired();
            builder.Property(x => x.EventType).HasMaxLength(100).IsRequired();
            builder.Property(x => x.Channel).HasConversion<string>().HasMaxLength(20).IsRequired();
            builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(20).IsRequired();
            builder.Property(x => x.FailureReason).HasMaxLength(1000);
            builder.HasIndex(x => x.RecipientUserId);
            builder.HasIndex(x => x.CreatedAtUtc);
            builder.HasIndex(x => new { x.RecipientUserId, x.CreatedAtUtc });
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
