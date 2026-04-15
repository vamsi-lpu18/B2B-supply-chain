using Order.Domain.Entities;
using Order.Domain.Enums;
using System.Reflection;

namespace Order.Domain.Tests;

public sealed class OrderAggregateTests
{
    [Fact]
    public void Create_SetsPlacedStatusAndPaymentMode()
    {
        var dealerId = Guid.NewGuid();

        var order = OrderAggregate.Create(dealerId, "ORD-1001", PaymentMode.COD);

        Assert.Equal(dealerId, order.DealerId);
        Assert.Equal("ORD-1001", order.OrderNumber);
        Assert.Equal(PaymentMode.COD, order.PaymentMode);
        Assert.Equal(OrderStatus.Placed, order.Status);
        Assert.Equal(CreditHoldStatus.NotRequired, order.CreditHoldStatus);
    }

    [Fact]
    public void TransitionTo_AllowedTransition_UpdatesStatusAndHistory()
    {
        var order = CreateOrder();
        var changedByUserId = Guid.NewGuid();

        order.TransitionTo(OrderStatus.Processing, changedByUserId, "Admin");

        Assert.Equal(OrderStatus.Processing, order.Status);
        Assert.Single(order.StatusHistory);

        var history = order.StatusHistory.Single();
        Assert.Equal(OrderStatus.Placed, history.FromStatus);
        Assert.Equal(OrderStatus.Processing, history.ToStatus);
        Assert.Equal(changedByUserId, history.ChangedByUserId);
    }

    [Fact]
    public void TransitionTo_InvalidTransition_ThrowsInvalidOperationException()
    {
        var order = CreateOrder();

        var ex = Assert.Throws<InvalidOperationException>(() =>
            order.TransitionTo(OrderStatus.Delivered, Guid.NewGuid(), "Admin"));

        Assert.Contains("Cannot transition order", ex.Message);
    }

    [Fact]
    public void AddLine_RecalculatesTotalAmount()
    {
        var order = CreateOrder();

        order.AddLine(Guid.NewGuid(), "Product A", "sku-1", 2, 125.50m, 1);
        order.AddLine(Guid.NewGuid(), "Product B", "sku-2", 1, 20m, 1);

        Assert.Equal(271m, order.TotalAmount);
        Assert.Equal(2, order.Lines.Count);
        Assert.Contains(order.Lines, line => line.Sku == "SKU-1");
    }

    [Fact]
    public void RaiseReturn_WhenDeliveredWithinWindow_CreatesReturnRequest()
    {
        var order = CreateOrder();
        MoveToDelivered(order);
        var dealerId = order.DealerId;

        order.RaiseReturn(dealerId, "Damaged package");

        Assert.Equal(OrderStatus.ReturnRequested, order.Status);
        Assert.NotNull(order.ReturnRequest);
        Assert.Equal("Damaged package", order.ReturnRequest!.Reason);
        Assert.Equal(dealerId, order.ReturnRequest.RequestedByDealerId);
    }

    [Fact]
    public void RaiseReturn_UsesDeliveryTimeForWindow_NotPlacedTime()
    {
        var order = CreateOrder();
        SetPlacedAtUtc(order, DateTime.UtcNow.AddDays(-10));
        MoveToDelivered(order);

        var ex = Record.Exception(() => order.RaiseReturn(order.DealerId, "Damaged package"));

        Assert.Null(ex);
        Assert.Equal(OrderStatus.ReturnRequested, order.Status);
        Assert.NotNull(order.ReturnRequest);
    }

    [Fact]
    public void MarkCreditRejected_CancelsOrderAndSetsReason()
    {
        var order = CreateOrder();

        order.MarkCreditRejected("  credit score too low  ");

        Assert.Equal(CreditHoldStatus.Rejected, order.CreditHoldStatus);
        Assert.Equal(OrderStatus.Cancelled, order.Status);
        Assert.Equal("credit score too low", order.CancellationReason);
    }

    private static OrderAggregate CreateOrder()
    {
        return OrderAggregate.Create(Guid.NewGuid(), "ORD-1001", PaymentMode.COD);
    }

    private static void MoveToDelivered(OrderAggregate order)
    {
        var changedByUserId = Guid.NewGuid();

        order.TransitionTo(OrderStatus.Processing, changedByUserId, "System");
        order.TransitionTo(OrderStatus.ReadyForDispatch, changedByUserId, "System");
        order.TransitionTo(OrderStatus.InTransit, changedByUserId, "System");
        order.TransitionTo(OrderStatus.Delivered, changedByUserId, "System");
    }

    private static void SetPlacedAtUtc(OrderAggregate order, DateTime placedAtUtc)
    {
        var property = typeof(OrderAggregate).GetProperty("PlacedAtUtc", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        Assert.NotNull(property);
        property!.SetValue(order, placedAtUtc);
    }
}
