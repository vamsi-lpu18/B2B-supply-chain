using BuildingBlocks.Persistence;
using CatalogInventory.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace CatalogInventory.Infrastructure.Persistence;

public sealed class CatalogInventoryDbContext(DbContextOptions<CatalogInventoryDbContext> options) : DbContext(options), IApplicationDbContext
{
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<StockTransaction> StockTransactions => Set<StockTransaction>();
    public DbSet<StockSubscription> StockSubscriptions => Set<StockSubscription>();
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

        modelBuilder.Entity<Product>(builder =>
        {
            builder.ToTable("Products");
            builder.HasKey(x => x.ProductId);
            builder.Property(x => x.Sku).HasMaxLength(60).IsRequired();
            builder.HasIndex(x => x.Sku).IsUnique();
            builder.Property(x => x.Name).HasMaxLength(200).IsRequired();
            builder.Property(x => x.Description).HasMaxLength(2000).IsRequired();
            builder.Property(x => x.UnitPrice).HasPrecision(18, 2);
            builder.Property(x => x.ImageUrl).HasMaxLength(500);
            builder.Ignore(x => x.AvailableStock);

            builder.HasOne<Category>()
                .WithMany()
                .HasForeignKey(x => x.CategoryId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Category>(builder =>
        {
            builder.ToTable("Categories");
            builder.HasKey(x => x.CategoryId);
            builder.Property(x => x.Name).HasMaxLength(140).IsRequired();

            builder.HasOne(x => x.ParentCategory)
                .WithMany(x => x.Children)
                .HasForeignKey(x => x.ParentCategoryId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<StockTransaction>(builder =>
        {
            builder.ToTable("StockTransactions");
            builder.HasKey(x => x.TxId);
            builder.Property(x => x.TransactionType).HasConversion<string>().HasMaxLength(40).IsRequired();
            builder.Property(x => x.ReferenceId).HasMaxLength(120).IsRequired();

            builder.HasOne<Product>()
                .WithMany()
                .HasForeignKey(x => x.ProductId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<StockSubscription>(builder =>
        {
            builder.ToTable("StockSubscriptions");
            builder.HasKey(x => x.StockSubscriptionId);
            builder.HasIndex(x => new { x.DealerId, x.ProductId }).IsUnique();

            builder.HasOne<Product>()
                .WithMany()
                .HasForeignKey(x => x.ProductId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        base.OnModelCreating(modelBuilder);
    }
}
