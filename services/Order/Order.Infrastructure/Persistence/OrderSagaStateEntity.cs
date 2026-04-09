using Order.Application.DTOs;

namespace Order.Infrastructure.Persistence;

public sealed class OrderSagaStateEntity
{
    public Guid OrderId { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public Guid DealerId { get; set; }
    public OrderSagaState CurrentState { get; set; } = OrderSagaState.Started;
    public DateTime StartedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public string? LastMessage { get; set; }
}
