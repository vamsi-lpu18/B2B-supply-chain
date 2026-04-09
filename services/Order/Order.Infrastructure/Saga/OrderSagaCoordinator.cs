using Microsoft.Extensions.Logging;
using Order.Application.Abstractions;
using Order.Application.DTOs;
using Order.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Order.Infrastructure.Saga;

internal sealed class OrderSagaCoordinator(
    OrderDbContext dbContext,
    ILogger<OrderSagaCoordinator> logger) : IOrderSagaCoordinator
{
    public async Task StartAsync(Guid orderId, string orderNumber, Guid dealerId, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;

        var saga = await dbContext.OrderSagaStates.FirstOrDefaultAsync(x => x.OrderId == orderId, cancellationToken);
        if (saga is null)
        {
            saga = new OrderSagaStateEntity
            {
                OrderId = orderId,
                OrderNumber = orderNumber,
                DealerId = dealerId,
                CurrentState = OrderSagaState.Started,
                StartedAtUtc = now,
                UpdatedAtUtc = now,
                LastMessage = "Saga started."
            };

            await dbContext.OrderSagaStates.AddAsync(saga, cancellationToken);
        }
        else
        {
            saga.OrderNumber = orderNumber;
            saga.DealerId = dealerId;
            saga.CurrentState = OrderSagaState.Started;
            saga.StartedAtUtc = now;
            saga.UpdatedAtUtc = now;
            saga.CompletedAtUtc = null;
            saga.LastMessage = "Saga restarted.";
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Order saga started for order {OrderId}", orderId);
    }

    public Task MarkCreditCheckInProgressAsync(Guid orderId, CancellationToken cancellationToken = default)
    {
        return TransitionAsync(orderId, OrderSagaState.CreditCheckInProgress, "Credit check started.", cancellationToken);
    }

    public Task MarkAwaitingManualApprovalAsync(Guid orderId, string? message, CancellationToken cancellationToken = default)
    {
        return TransitionAsync(orderId, OrderSagaState.AwaitingManualApproval, message ?? "Awaiting manual approval.", cancellationToken);
    }

    public Task MarkCompletedApprovedAsync(Guid orderId, string? message, CancellationToken cancellationToken = default)
    {
        return TransitionAsync(orderId, OrderSagaState.CompletedApproved, message ?? "Order approved.", cancellationToken);
    }

    public Task MarkCompletedRejectedAsync(Guid orderId, string? message, CancellationToken cancellationToken = default)
    {
        return TransitionAsync(orderId, OrderSagaState.CompletedRejected, message ?? "Order rejected.", cancellationToken);
    }

    public Task MarkCompletedCancelledAsync(Guid orderId, string? message, CancellationToken cancellationToken = default)
    {
        return TransitionAsync(orderId, OrderSagaState.CompletedCancelled, message ?? "Order cancelled.", cancellationToken);
    }

    public async Task<OrderSagaDto?> GetAsync(Guid orderId, CancellationToken cancellationToken = default)
    {
        var saga = await dbContext.OrderSagaStates.AsNoTracking().FirstOrDefaultAsync(x => x.OrderId == orderId, cancellationToken);
        if (saga is null)
        {
            return null;
        }

        return new OrderSagaDto(
            saga.OrderId,
            saga.OrderNumber,
            saga.DealerId,
            saga.CurrentState,
            saga.StartedAtUtc,
            saga.UpdatedAtUtc,
            saga.CompletedAtUtc,
            saga.LastMessage);
    }

    private async Task TransitionAsync(
        Guid orderId,
        OrderSagaState state,
        string? message,
        CancellationToken cancellationToken)
    {
        var saga = await dbContext.OrderSagaStates.FirstOrDefaultAsync(x => x.OrderId == orderId, cancellationToken);
        if (saga is null)
        {
            return;
        }

        saga.CurrentState = state;
        saga.UpdatedAtUtc = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(message))
        {
            saga.LastMessage = message;
        }

        if (IsTerminal(state))
        {
            saga.CompletedAtUtc ??= saga.UpdatedAtUtc;
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Order saga {OrderId} transitioned to {SagaState}", orderId, state);
    }

    private static bool IsTerminal(OrderSagaState state)
    {
        return state is OrderSagaState.CompletedApproved
            or OrderSagaState.CompletedRejected
            or OrderSagaState.CompletedCancelled;
    }
}
