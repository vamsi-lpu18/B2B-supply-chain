namespace PaymentInvoice.Domain.Entities;

public sealed class InvoiceLine
{
    private InvoiceLine()
    {
    }

    public Guid InvoiceLineId { get; private set; } = Guid.NewGuid();
    public Guid InvoiceId { get; private set; }
    public Guid ProductId { get; private set; }
    public string ProductName { get; private set; } = string.Empty;
    public string Sku { get; private set; } = string.Empty;
    public string HsnCode { get; private set; } = string.Empty;
    public int Quantity { get; private set; }
    public decimal UnitPrice { get; private set; }
    public decimal LineTotal => UnitPrice * Quantity;

    public static InvoiceLine Create(
        Guid invoiceId,
        Guid productId,
        string productName,
        string sku,
        string hsnCode,
        int quantity,
        decimal unitPrice)
    {
        return new InvoiceLine
        {
            InvoiceId = invoiceId,
            ProductId = productId,
            ProductName = productName.Trim(),
            Sku = sku.Trim().ToUpperInvariant(),
            HsnCode = hsnCode.Trim(),
            Quantity = quantity,
            UnitPrice = unitPrice
        };
    }
}
