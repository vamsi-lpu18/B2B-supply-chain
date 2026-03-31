namespace Order.Domain.Enums;

public enum OrderStatus
{
    Placed = 0,
    OnHold = 1,
    Processing = 2,
    ReadyForDispatch = 3,
    InTransit = 4,
    Exception = 5,
    Delivered = 6,
    ReturnRequested = 7,
    ReturnApproved = 8,
    ReturnRejected = 9,
    Closed = 10,
    Cancelled = 11
}
