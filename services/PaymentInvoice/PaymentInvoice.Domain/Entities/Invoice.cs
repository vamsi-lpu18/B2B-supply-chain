using PaymentInvoice.Domain.Enums;

namespace PaymentInvoice.Domain.Entities;

public sealed class Invoice
{
    private Invoice()
    {
    }

    public Guid InvoiceId { get; private set; } = Guid.NewGuid();
    public string InvoiceNumber { get; private set; } = string.Empty;
    public Guid OrderId { get; private set; }
    public Guid DealerId { get; private set; }
    public string IdempotencyKey { get; private set; } = string.Empty;
    public decimal Subtotal { get; private set; }
    public GstType GstType { get; private set; }
    public decimal GstRate { get; private set; }
    public decimal GstAmount { get; private set; }
    public decimal GrandTotal { get; private set; }
    public string PdfStoragePath { get; private set; } = string.Empty;
    public DateTime CreatedAtUtc { get; private set; } = DateTime.UtcNow;

    public ICollection<InvoiceLine> Lines { get; private set; } = new List<InvoiceLine>();

    public static Invoice Create(
        Guid orderId,
        Guid dealerId,
        string invoiceNumber,
        string idempotencyKey,
        bool isInterstate)
    {
        return new Invoice
        {
            OrderId = orderId,
            DealerId = dealerId,
            InvoiceNumber = invoiceNumber,
            IdempotencyKey = idempotencyKey,
            GstType = isInterstate ? GstType.IGST : GstType.CGST_SGST,
            GstRate = 18m
        };
    }

    public void AddLine(Guid productId, string productName, string sku, string hsnCode, int quantity, decimal unitPrice)
    {
        Lines.Add(InvoiceLine.Create(InvoiceId, productId, productName, sku, hsnCode, quantity, unitPrice));
        Recalculate();
    }

    public void SetPdfPath(string path)
    {
        PdfStoragePath = path;
    }

    private void Recalculate()
    {
        Subtotal = Lines.Sum(x => x.LineTotal);
        GstAmount = Math.Round(Subtotal * (GstRate / 100m), 2, MidpointRounding.AwayFromZero);
        GrandTotal = Subtotal + GstAmount;
    }
}
