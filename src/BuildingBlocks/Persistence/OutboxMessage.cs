namespace BuildingBlocks.Persistence;

public sealed class OutboxMessage
{
    public Guid MessageId { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string Payload { get; set; } = string.Empty;
    public OutboxStatus Status { get; set; } = OutboxStatus.Pending;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? PublishedAtUtc { get; set; }
    public int RetryCount { get; set; }
    public string? Error { get; set; }
}
