using BuildingBlocks.Persistence;
using IdentityAuth.Domain.Entities;
using IdentityAuth.Domain.ValueObjects;
using Microsoft.EntityFrameworkCore;

namespace IdentityAuth.Infrastructure.Persistence;

public sealed class IdentityAuthDbContext(DbContextOptions<IdentityAuthDbContext> options) : DbContext(options), IApplicationDbContext
{
    public DbSet<User> Users => Set<User>();
    public DbSet<DealerProfile> DealerProfiles => Set<DealerProfile>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<OtpRecord> OtpRecords => Set<OtpRecord>();
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

        modelBuilder.Entity<User>(builder =>
        {
            builder.ToTable("Users");
            builder.HasKey(x => x.UserId);
            builder.Property(x => x.Email).HasMaxLength(256).IsRequired();
            builder.HasIndex(x => x.Email).IsUnique();
            builder.HasIndex(x => new { x.Role, x.Status, x.CreatedAtUtc });
            builder.Property(x => x.PasswordHash).HasMaxLength(1024).IsRequired();
            builder.Property(x => x.FullName).HasMaxLength(120).IsRequired();
            builder.Property(x => x.PhoneNumber).HasMaxLength(20).IsRequired();
            builder.Property(x => x.Role).HasConversion<string>().HasMaxLength(32).IsRequired();
            builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32).IsRequired();
            builder.Property(x => x.CreditLimit).HasPrecision(18, 2);
            builder.Property(x => x.RejectionReason).HasMaxLength(400);
        });

        modelBuilder.Entity<DealerProfile>(builder =>
        {
            builder.ToTable("DealerProfiles");
            builder.HasKey(x => x.DealerProfileId);
            builder.HasIndex(x => x.GstNumber).IsUnique();
            builder.Property(x => x.BusinessName).HasMaxLength(180).IsRequired();
            builder.Property(x => x.GstNumber).HasMaxLength(20).IsRequired();
            builder.Property(x => x.TradeLicenseNo).HasMaxLength(80).IsRequired();
            builder.Property(x => x.Address).HasMaxLength(300).IsRequired();
            builder.Property(x => x.City).HasMaxLength(100).IsRequired();
            builder.Property(x => x.State).HasMaxLength(100).IsRequired();
            builder.Property(x => x.PinCode).HasMaxLength(6).IsRequired();

            builder.HasOne<User>()
                .WithOne(x => x.DealerProfile)
                .HasForeignKey<DealerProfile>(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<RefreshToken>(builder =>
        {
            builder.ToTable("RefreshTokens");
            builder.HasKey(x => x.RefreshTokenId);
            builder.HasIndex(x => x.TokenHash).IsUnique();
            builder.Property(x => x.TokenHash).HasMaxLength(128).IsRequired();

            builder.HasOne<User>()
                .WithMany(x => x.RefreshTokens)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<OtpRecord>(builder =>
        {
            builder.ToTable("OtpRecords");
            builder.HasKey(x => x.OtpRecordId);
            builder.Property(x => x.OtpHash).HasMaxLength(128).IsRequired();

            builder.HasOne<User>()
                .WithMany(x => x.OtpRecords)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        base.OnModelCreating(modelBuilder);
    }
}
