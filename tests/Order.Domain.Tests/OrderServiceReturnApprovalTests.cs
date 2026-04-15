using FluentValidation;
using Order.Application.Abstractions;
using Order.Application.DTOs;
using Order.Application.Services;
using Order.Domain.Entities;
using Order.Domain.Enums;

namespace Order.Domain.Tests;

public sealed class OrderServiceReturnApprovalTests
{
    [Fact]
    public async Task ApproveReturnAsync_WhenCompensationSucceeds_RestocksGroupedLinesSettlesCreditAndApproves()
    {
        var productId = Guid.NewGuid();
        var order = BuildReturnRequestedOrder(productId);
        var repository = new FakeOrderRepository(order);
        var inventoryGateway = new FakeInventoryGateway(restockResult: true);
        var creditGateway = new FakeCreditCheckGateway(settleResult: true);
        var service = CreateService(repository, creditGateway, inventoryGateway);

        var result = await service.ApproveReturnAsync(order.OrderId, Guid.NewGuid(), CancellationToken.None);

        Assert.True(result);
        Assert.Equal(OrderStatus.ReturnApproved, order.Status);

        var restockCall = Assert.Single(inventoryGateway.RestockCalls);
        Assert.Equal(order.OrderId, restockCall.OrderId);
        Assert.Equal(productId, restockCall.ProductId);
        Assert.Equal(5, restockCall.Quantity);
        Assert.StartsWith($"return-{order.OrderId:N}-", restockCall.ReferenceId, StringComparison.Ordinal);

        var settlementCall = Assert.Single(creditGateway.SettlementCalls);
        Assert.Equal(order.DealerId, settlementCall.DealerId);
        Assert.Equal(order.TotalAmount, settlementCall.Amount);
        Assert.Equal($"return-{order.OrderId:N}", settlementCall.ReferenceNo);

        Assert.Contains(repository.OutboxMessages, message => message.EventType == "ReturnApproved");
        Assert.Equal(1, repository.SaveChangesCalls);
    }

    [Fact]
    public async Task ApproveReturnAsync_WhenRestockFails_ThrowsAndDoesNotSettleOrApprove()
    {
        var order = BuildReturnRequestedOrder(Guid.NewGuid());
        var repository = new FakeOrderRepository(order);
        var inventoryGateway = new FakeInventoryGateway(restockResult: false);
        var creditGateway = new FakeCreditCheckGateway(settleResult: true);
        var service = CreateService(repository, creditGateway, inventoryGateway);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.ApproveReturnAsync(order.OrderId, Guid.NewGuid(), CancellationToken.None));

        Assert.Equal("Unable to restock returned items.", ex.Message);
        Assert.Equal(OrderStatus.ReturnRequested, order.Status);
        Assert.Empty(creditGateway.SettlementCalls);
        Assert.Empty(repository.OutboxMessages);
        Assert.Equal(0, repository.SaveChangesCalls);
    }

    [Fact]
    public async Task ApproveReturnAsync_WhenCreditSettlementFails_ThrowsAndKeepsReturnRequested()
    {
        var order = BuildReturnRequestedOrder(Guid.NewGuid());
        var repository = new FakeOrderRepository(order);
        var inventoryGateway = new FakeInventoryGateway(restockResult: true);
        var creditGateway = new FakeCreditCheckGateway(settleResult: false);
        var service = CreateService(repository, creditGateway, inventoryGateway);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.ApproveReturnAsync(order.OrderId, Guid.NewGuid(), CancellationToken.None));

        Assert.Equal("Unable to settle dealer outstanding for approved return.", ex.Message);
        Assert.Equal(OrderStatus.ReturnRequested, order.Status);
        Assert.Single(inventoryGateway.RestockCalls);
        Assert.Empty(repository.OutboxMessages);
        Assert.Equal(0, repository.SaveChangesCalls);
    }

    private static OrderService CreateService(
        IOrderRepository repository,
        ICreditCheckGateway creditGateway,
        IInventoryGateway inventoryGateway)
    {
        return new OrderService(
            repository,
            creditGateway,
            inventoryGateway,
            new NoOpSagaCoordinator(),
            new InlineValidator<CreateOrderRequest>(),
            new InlineValidator<CancelOrderRequest>(),
            new InlineValidator<BulkUpdateOrderStatusRequest>(),
            new InlineValidator<ReturnRequestDto>());
    }

    private static OrderAggregate BuildReturnRequestedOrder(Guid productId)
    {
        var dealerId = Guid.NewGuid();
        var order = OrderAggregate.Create(dealerId, "ORD-RET-0001", PaymentMode.COD);

        order.AddLine(productId, "Industrial Motor", "SKU-RET-1", 2, 100m, 1);
        order.AddLine(productId, "Industrial Motor", "SKU-RET-1", 3, 100m, 1);

        var actor = Guid.NewGuid();
        order.TransitionTo(OrderStatus.Processing, actor, "System");
        order.TransitionTo(OrderStatus.ReadyForDispatch, actor, "System");
        order.TransitionTo(OrderStatus.InTransit, actor, "System");
        order.TransitionTo(OrderStatus.Delivered, actor, "System");
        order.RaiseReturn(dealerId, "Damaged during transport");

        return order;
    }

    private sealed class FakeOrderRepository(OrderAggregate seededOrder) : IOrderRepository
    {
        public List<OutboxMessageEntry> OutboxMessages { get; } = [];

        public int SaveChangesCalls { get; private set; }

        public Task AddOrderAsync(OrderAggregate order, CancellationToken cancellationToken)
            => throw new NotSupportedException("Not needed for this test.");

        public Task<OrderAggregate?> GetOrderByIdAsync(Guid orderId, CancellationToken cancellationToken)
            => Task.FromResult(seededOrder.OrderId == orderId ? seededOrder : null);

        public Task<IReadOnlyList<OrderAggregate>> GetOrdersByIdsAsync(IReadOnlyCollection<Guid> orderIds, CancellationToken cancellationToken)
        {
            IReadOnlyList<OrderAggregate> result = orderIds.Contains(seededOrder.OrderId)
                ? [seededOrder]
                : [];
            return Task.FromResult(result);
        }

        public Task<(IReadOnlyList<OrderAggregate> Items, int TotalCount)> GetDealerOrdersAsync(Guid dealerId, int page, int pageSize, CancellationToken cancellationToken)
            => throw new NotSupportedException("Not needed for this test.");

        public Task<(IReadOnlyList<OrderAggregate> Items, int TotalCount)> GetAllOrdersAsync(int page, int pageSize, int? status, CancellationToken cancellationToken)
            => throw new NotSupportedException("Not needed for this test.");

        public Task<OrderAnalyticsDto> GetOrderAnalyticsAsync(DateTime fromUtc, int top, CancellationToken cancellationToken)
            => throw new NotSupportedException("Not needed for this test.");

        public Task AddOutboxMessageAsync(string eventType, object payload, CancellationToken cancellationToken)
        {
            OutboxMessages.Add(new OutboxMessageEntry(eventType, payload));
            return Task.CompletedTask;
        }

        public Task SaveChangesAsync(CancellationToken cancellationToken)
        {
            SaveChangesCalls++;
            return Task.CompletedTask;
        }
    }

    private sealed class FakeCreditCheckGateway(bool settleResult) : ICreditCheckGateway
    {
        public List<SettlementCall> SettlementCalls { get; } = [];

        public Task<CreditCheckResult> CheckCreditAsync(Guid dealerId, decimal amount, CancellationToken cancellationToken)
            => Task.FromResult(new CreditCheckResult(true, 1_000_000m, 0m, amount));

        public Task<bool> SettleOutstandingAsync(Guid dealerId, decimal amount, string referenceNo, CancellationToken cancellationToken)
        {
            SettlementCalls.Add(new SettlementCall(dealerId, amount, referenceNo));
            return Task.FromResult(settleResult);
        }
    }

    private sealed class FakeInventoryGateway(bool restockResult) : IInventoryGateway
    {
        public List<RestockCall> RestockCalls { get; } = [];

        public Task<bool> SoftLockStockAsync(Guid orderId, Guid productId, int quantity, CancellationToken cancellationToken)
            => Task.FromResult(true);

        public Task<bool> HardDeductStockAsync(Guid orderId, Guid productId, int quantity, CancellationToken cancellationToken)
            => Task.FromResult(true);

        public Task<bool> ReleaseSoftLockAsync(Guid orderId, Guid productId, CancellationToken cancellationToken)
            => Task.FromResult(true);

        public Task<bool> RestockStockAsync(Guid orderId, Guid productId, int quantity, string referenceId, CancellationToken cancellationToken)
        {
            RestockCalls.Add(new RestockCall(orderId, productId, quantity, referenceId));
            return Task.FromResult(restockResult);
        }
    }

    private sealed class NoOpSagaCoordinator : IOrderSagaCoordinator
    {
        public Task StartAsync(Guid orderId, string orderNumber, Guid dealerId, CancellationToken cancellationToken = default)
            => Task.CompletedTask;

        public Task MarkCreditCheckInProgressAsync(Guid orderId, CancellationToken cancellationToken = default)
            => Task.CompletedTask;

        public Task MarkAwaitingManualApprovalAsync(Guid orderId, string? message, CancellationToken cancellationToken = default)
            => Task.CompletedTask;

        public Task MarkCompletedApprovedAsync(Guid orderId, string? message, CancellationToken cancellationToken = default)
            => Task.CompletedTask;

        public Task MarkCompletedRejectedAsync(Guid orderId, string? message, CancellationToken cancellationToken = default)
            => Task.CompletedTask;

        public Task MarkCompletedCancelledAsync(Guid orderId, string? message, CancellationToken cancellationToken = default)
            => Task.CompletedTask;

        public Task<OrderSagaDto?> GetAsync(Guid orderId, CancellationToken cancellationToken = default)
            => Task.FromResult<OrderSagaDto?>(null);
    }

    private sealed record OutboxMessageEntry(string EventType, object Payload);
    private sealed record SettlementCall(Guid DealerId, decimal Amount, string ReferenceNo);
    private sealed record RestockCall(Guid OrderId, Guid ProductId, int Quantity, string ReferenceId);
}
