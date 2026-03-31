using CatalogInventory.Domain.Enums;

namespace CatalogInventory.Domain.Entities;

public sealed class StockTransaction
{
    private StockTransaction()
    {
    }

    public Guid TxId { get; private set; } = Guid.NewGuid();
    public Guid ProductId { get; private set; }
    public StockTransactionType TransactionType { get; private set; }
    public int Quantity { get; private set; }
    public string ReferenceId { get; private set; } = string.Empty;
    public DateTime CreatedAtUtc { get; private set; } = DateTime.UtcNow;

    public static StockTransaction Create(
        Guid productId,
        StockTransactionType transactionType,
        int quantity,
        string referenceId)
    {
        return new StockTransaction
        {
            ProductId = productId,
            TransactionType = transactionType,
            Quantity = quantity,
            ReferenceId = referenceId.Trim()
        };
    }
}
