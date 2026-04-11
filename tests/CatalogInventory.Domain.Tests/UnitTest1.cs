using CatalogInventory.Domain.Entities;

namespace CatalogInventory.Domain.Tests;

public sealed class ProductTests
{
    [Fact]
    public void Create_NormalizesSkuAndInitialStock()
    {
        var categoryId = Guid.NewGuid();

        var product = Product.Create(" abc-101 ", "Widget", "Industrial widget", categoryId, 99.5m, 2, 100, null);

        Assert.Equal("ABC-101", product.Sku);
        Assert.Equal(100, product.TotalStock);
        Assert.Equal(100, product.AvailableStock);
        Assert.True(product.IsActive);
    }

    [Fact]
    public void Restock_IncreasesTotalStock()
    {
        var product = CreateProduct(openingStock: 10);

        product.Restock(25);

        Assert.Equal(35, product.TotalStock);
        Assert.Equal(35, product.AvailableStock);
    }

    [Fact]
    public void HardDeduct_WithInsufficientAvailableStock_Throws()
    {
        var product = CreateProduct(openingStock: 5);

        var ex = Assert.Throws<InvalidOperationException>(() => product.HardDeduct(6));

        Assert.Contains("Insufficient available stock", ex.Message);
    }

    [Fact]
    public void Deactivate_SetsProductInactive()
    {
        var product = CreateProduct(openingStock: 5);

        product.Deactivate();

        Assert.False(product.IsActive);
    }

    private static Product CreateProduct(int openingStock)
    {
        return Product.Create("SKU-1", "Widget", "Industrial widget", Guid.NewGuid(), 10m, 1, openingStock, null);
    }
}
