using PaymentInvoice.Domain.Enums;

namespace PaymentInvoice.Domain.Entities;

public sealed class PaymentRecord
{
    private PaymentRecord()
    {
    }

    public Guid PaymentRecordId { get; private set; } = Guid.NewGuid();
    public Guid OrderId { get; private set; }
    public Guid DealerId { get; private set; }
    public PaymentMode PaymentMode { get; private set; }
    public decimal Amount { get; private set; }
    public string? ReferenceNo { get; private set; }
    public DateTime CreatedAtUtc { get; private set; } = DateTime.UtcNow;

    public static PaymentRecord Create(Guid orderId, Guid dealerId, PaymentMode paymentMode, decimal amount, string? referenceNo)
    {
        return new PaymentRecord
        {
            OrderId = orderId,
            DealerId = dealerId,
            PaymentMode = paymentMode,
            Amount = amount,
            ReferenceNo = string.IsNullOrWhiteSpace(referenceNo) ? null : referenceNo.Trim()
        };
    }
}
