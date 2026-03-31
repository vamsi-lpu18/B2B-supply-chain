namespace CatalogInventory.Domain.Enums;

public enum StockTransactionType
{
    Restock = 0,
    SoftLock = 1,
    HardDeduct = 2,
    ReleaseReserve = 3,
    ReturnRestock = 4
}
