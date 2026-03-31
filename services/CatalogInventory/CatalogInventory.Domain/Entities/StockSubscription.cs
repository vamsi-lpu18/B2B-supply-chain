namespace CatalogInventory.Domain.Entities;

public sealed class StockSubscription
{
    private StockSubscription()
    {
    }

    public Guid StockSubscriptionId { get; private set; } = Guid.NewGuid();
    public Guid DealerId { get; private set; }
    public Guid ProductId { get; private set; }
    public DateTime CreatedAtUtc { get; private set; } = DateTime.UtcNow;

    public static StockSubscription Create(Guid dealerId, Guid productId)
    {
        return new StockSubscription
        {
            DealerId = dealerId,
            ProductId = productId
        };
    }
}
