namespace Order.Domain.Entities;

public sealed class ReturnRequest
{
    private ReturnRequest()
    {
    }

    public Guid ReturnRequestId { get; private set; }
    public Guid OrderId { get; private set; }
    public Guid RequestedByDealerId { get; private set; }
    public string Reason { get; private set; } = string.Empty;
    public DateTime RequestedAtUtc { get; private set; } = DateTime.UtcNow;
    public bool IsApproved { get; private set; }
    public bool IsRejected { get; private set; }
    public DateTime? ReviewedAtUtc { get; private set; }

    public static ReturnRequest Create(Guid orderId, Guid requestedByDealerId, string reason)
    {
        return new ReturnRequest
        {
            OrderId = orderId,
            RequestedByDealerId = requestedByDealerId,
            Reason = reason.Trim()
        };
    }

    public void Approve()
    {
        IsApproved = true;
        IsRejected = false;
        ReviewedAtUtc = DateTime.UtcNow;
    }

    public void Reject()
    {
        IsRejected = true;
        IsApproved = false;
        ReviewedAtUtc = DateTime.UtcNow;
    }
}
