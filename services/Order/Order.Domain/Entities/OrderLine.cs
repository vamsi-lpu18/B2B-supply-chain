namespace Order.Domain.Entities;

public sealed class OrderLine
{
    private OrderLine()
    {
    }

    public Guid OrderLineId { get; private set; } = Guid.NewGuid();
    public Guid OrderId { get; private set; }
    public Guid ProductId { get; private set; }
    public string ProductName { get; private set; } = string.Empty;
    public string Sku { get; private set; } = string.Empty;
    public int Quantity { get; private set; }
    public decimal UnitPrice { get; private set; }
    public decimal LineTotal => UnitPrice * Quantity;

    public static OrderLine Create(
        Guid orderId,
        Guid productId,
        string productName,
        string sku,
        int quantity,
        decimal unitPrice,
        int minOrderQty)
    {
        if (quantity <= 0)
        {
            throw new InvalidOperationException("Line quantity must be greater than zero.");
        }

        if (quantity < minOrderQty)
        {
            throw new InvalidOperationException("Line quantity is below product minimum order quantity.");
        }

        if (unitPrice <= 0m)
        {
            throw new InvalidOperationException("Unit price must be greater than zero.");
        }

        return new OrderLine
        {
            OrderId = orderId,
            ProductId = productId,
            ProductName = productName.Trim(),
            Sku = sku.Trim().ToUpperInvariant(),
            Quantity = quantity,
            UnitPrice = unitPrice
        };
    }
}
