using Order.Domain.Enums;

namespace Order.Domain.Entities;

public sealed class OrderStatusHistory
{
    private OrderStatusHistory()
    {
    }

    public Guid HistoryId { get; private set; }
    public Guid OrderId { get; private set; }
    public OrderStatus FromStatus { get; private set; }
    public OrderStatus ToStatus { get; private set; }
    public Guid ChangedByUserId { get; private set; }
    public string ChangedByRole { get; private set; } = string.Empty;
    public DateTime ChangedAtUtc { get; private set; } = DateTime.UtcNow;

    public static OrderStatusHistory Create(
        Guid orderId,
        OrderStatus fromStatus,
        OrderStatus toStatus,
        Guid changedByUserId,
        string changedByRole)
    {
        return new OrderStatusHistory
        {
            OrderId = orderId,
            FromStatus = fromStatus,
            ToStatus = toStatus,
            ChangedByUserId = changedByUserId,
            ChangedByRole = changedByRole
        };
    }
}
