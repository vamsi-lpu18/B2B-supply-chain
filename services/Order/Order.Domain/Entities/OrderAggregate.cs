using Order.Domain.Enums;

namespace Order.Domain.Entities;

public sealed class OrderAggregate
{
    private static readonly Dictionary<OrderStatus, HashSet<OrderStatus>> AllowedTransitions = new()
    {
        [OrderStatus.Placed] = [OrderStatus.Processing, OrderStatus.OnHold, OrderStatus.Cancelled],
        [OrderStatus.OnHold] = [OrderStatus.Processing, OrderStatus.Cancelled],
        [OrderStatus.Processing] = [OrderStatus.ReadyForDispatch, OrderStatus.Cancelled],
        [OrderStatus.ReadyForDispatch] = [OrderStatus.InTransit, OrderStatus.Cancelled],
        [OrderStatus.InTransit] = [OrderStatus.Delivered, OrderStatus.Exception],
        [OrderStatus.Exception] = [OrderStatus.InTransit, OrderStatus.Cancelled],
        [OrderStatus.Delivered] = [OrderStatus.Closed, OrderStatus.ReturnRequested],
        [OrderStatus.ReturnRequested] = [OrderStatus.ReturnApproved, OrderStatus.ReturnRejected],
        [OrderStatus.ReturnApproved] = [OrderStatus.Closed],
        [OrderStatus.ReturnRejected] = [OrderStatus.Closed],
        [OrderStatus.Closed] = [],
        [OrderStatus.Cancelled] = []
    };

    private OrderAggregate()
    {
    }

    public Guid OrderId { get; private set; } = Guid.NewGuid();
    public string OrderNumber { get; private set; } = string.Empty;
    public Guid DealerId { get; private set; }
    public OrderStatus Status { get; private set; }
    public decimal TotalAmount { get; private set; }
    public CreditHoldStatus CreditHoldStatus { get; private set; } = CreditHoldStatus.NotRequired;
    public PaymentMode PaymentMode { get; private set; }
    public DateTime PlacedAtUtc { get; private set; } = DateTime.UtcNow;
    public string? CancellationReason { get; private set; }

    public ICollection<OrderLine> Lines { get; private set; } = new List<OrderLine>();
    public ICollection<OrderStatusHistory> StatusHistory { get; private set; } = new List<OrderStatusHistory>();
    public ReturnRequest? ReturnRequest { get; private set; }

    public static OrderAggregate Create(Guid dealerId, string orderNumber, PaymentMode paymentMode)
    {
        return new OrderAggregate
        {
            DealerId = dealerId,
            OrderNumber = orderNumber,
            PaymentMode = paymentMode,
            Status = OrderStatus.Placed,
            PlacedAtUtc = DateTime.UtcNow
        };
    }

    public void AddLine(
        Guid productId,
        string productName,
        string sku,
        int quantity,
        decimal unitPrice,
        int minOrderQty)
    {
        var line = OrderLine.Create(
            OrderId,
            productId,
            productName,
            sku,
            quantity,
            unitPrice,
            minOrderQty);

        Lines.Add(line);
        TotalAmount = Lines.Sum(x => x.LineTotal);
    }

    public void MarkCreditHold()
    {
        CreditHoldStatus = CreditHoldStatus.PendingApproval;
        Status = OrderStatus.OnHold;
    }

    public void MarkCreditApproved()
    {
        CreditHoldStatus = CreditHoldStatus.Approved;
    }

    public void MarkCreditRejected(string reason)
    {
        CreditHoldStatus = CreditHoldStatus.Rejected;
        Cancel(reason, Guid.Empty, "System");
    }

    public void Cancel(string reason, Guid changedByUserId, string changedByRole)
    {
        CancellationReason = reason.Trim();
        TransitionTo(OrderStatus.Cancelled, changedByUserId, changedByRole);
    }

    public bool CanTransitionTo(OrderStatus newStatus)
    {
        return AllowedTransitions.TryGetValue(Status, out var allowed) && allowed.Contains(newStatus);
    }

    public void TransitionTo(OrderStatus newStatus, Guid changedByUserId, string changedByRole)
    {
        if (!CanTransitionTo(newStatus))
        {
            throw new InvalidOperationException($"Cannot transition order from '{Status}' to '{newStatus}'.");
        }

        var previousStatus = Status;
        Status = newStatus;

        StatusHistory.Add(OrderStatusHistory.Create(
            OrderId,
            previousStatus,
            newStatus,
            changedByUserId,
            changedByRole));
    }

    public void RaiseReturn(Guid requestedByDealerId, string reason)
    {
        if (Status != OrderStatus.Delivered)
        {
            throw new InvalidOperationException("Return request can only be raised after delivery.");
        }

        if (PlacedAtUtc.AddHours(48) < DateTime.UtcNow)
        {
            throw new InvalidOperationException("Return window has expired.");
        }

        if (ReturnRequest is not null)
        {
            throw new InvalidOperationException("Return request already exists for this order.");
        }

        ReturnRequest = ReturnRequest.Create(OrderId, requestedByDealerId, reason);
        TransitionTo(OrderStatus.ReturnRequested, requestedByDealerId, "Dealer");
    }

    public void ApproveReturn(Guid reviewedByUserId, string role)
    {
        if (ReturnRequest is null)
        {
            throw new InvalidOperationException("No return request found.");
        }

        ReturnRequest.Approve();
        TransitionTo(OrderStatus.ReturnApproved, reviewedByUserId, role);
    }

    public void RejectReturn(Guid reviewedByUserId, string role)
    {
        if (ReturnRequest is null)
        {
            throw new InvalidOperationException("No return request found.");
        }

        ReturnRequest.Reject();
        TransitionTo(OrderStatus.ReturnRejected, reviewedByUserId, role);
    }
}
