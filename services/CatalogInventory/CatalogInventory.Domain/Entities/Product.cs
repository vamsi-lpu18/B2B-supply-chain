namespace CatalogInventory.Domain.Entities;

public sealed class Product
{
    private Product()
    {
    }

    public Guid ProductId { get; private set; } = Guid.NewGuid();
    public string Sku { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public string Description { get; private set; } = string.Empty;
    public Guid CategoryId { get; private set; }
    public decimal UnitPrice { get; private set; }
    public int MinOrderQty { get; private set; }
    public int TotalStock { get; private set; }
    public int ReservedStock { get; private set; }
    public bool IsActive { get; private set; } = true;
    public string? ImageUrl { get; private set; }
    public DateTime CreatedAtUtc { get; private set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; private set; } = DateTime.UtcNow;

    public int AvailableStock => TotalStock - ReservedStock;

    public static Product Create(
        string sku,
        string name,
        string description,
        Guid categoryId,
        decimal unitPrice,
        int minOrderQty,
        int openingStock,
        string? imageUrl)
    {
        if (openingStock < 0)
        {
            throw new InvalidOperationException("Opening stock cannot be negative.");
        }

        return new Product
        {
            Sku = sku.Trim().ToUpperInvariant(),
            Name = name.Trim(),
            Description = description.Trim(),
            CategoryId = categoryId,
            UnitPrice = unitPrice,
            MinOrderQty = minOrderQty,
            TotalStock = openingStock,
            ImageUrl = string.IsNullOrWhiteSpace(imageUrl) ? null : imageUrl.Trim(),
            UpdatedAtUtc = DateTime.UtcNow
        };
    }

    public void Update(
        string name,
        string description,
        Guid categoryId,
        decimal unitPrice,
        int minOrderQty,
        string? imageUrl,
        bool isActive)
    {
        Name = name.Trim();
        Description = description.Trim();
        CategoryId = categoryId;
        UnitPrice = unitPrice;
        MinOrderQty = minOrderQty;
        ImageUrl = string.IsNullOrWhiteSpace(imageUrl) ? null : imageUrl.Trim();
        IsActive = isActive;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void Deactivate()
    {
        IsActive = false;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void Restock(int quantity)
    {
        if (quantity <= 0)
        {
            throw new InvalidOperationException("Restock quantity must be greater than zero.");
        }

        TotalStock += quantity;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void SoftReserve(int quantity)
    {
        if (quantity <= 0)
        {
            throw new InvalidOperationException("Reserve quantity must be greater than zero.");
        }

        if (AvailableStock < quantity)
        {
            throw new InvalidOperationException("Insufficient available stock.");
        }

        ReservedStock += quantity;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void ReleaseReserve(int quantity)
    {
        if (quantity <= 0)
        {
            throw new InvalidOperationException("Release quantity must be greater than zero.");
        }

        if (ReservedStock < quantity)
        {
            throw new InvalidOperationException("Reserved stock is lower than release quantity.");
        }

        ReservedStock -= quantity;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void HardDeductReserved(int quantity)
    {
        if (quantity <= 0)
        {
            throw new InvalidOperationException("Deduct quantity must be greater than zero.");
        }

        if (ReservedStock < quantity)
        {
            throw new InvalidOperationException("Reserved stock is lower than deduct quantity.");
        }

        if (TotalStock < quantity)
        {
            throw new InvalidOperationException("Insufficient total stock.");
        }

        ReservedStock -= quantity;
        TotalStock -= quantity;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void HardDeduct(int quantity)
    {
        if (quantity <= 0)
        {
            throw new InvalidOperationException("Deduct quantity must be greater than zero.");
        }

        if (AvailableStock < quantity)
        {
            throw new InvalidOperationException("Insufficient available stock.");
        }

        TotalStock -= quantity;
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
