using LogisticsTracking.Domain.Enums;

namespace LogisticsTracking.Domain.Entities;

public sealed class ShipmentOpsState
{
    private ShipmentOpsState()
    {
    }

    public Guid ShipmentId { get; private set; }
    public HandoverState HandoverState { get; private set; } = HandoverState.Pending;
    public string? HandoverExceptionReason { get; private set; }
    public bool RetryRequired { get; private set; }
    public int RetryCount { get; private set; }
    public string? RetryReason { get; private set; }
    public DateTime? NextRetryAtUtc { get; private set; }
    public DateTime? LastRetryScheduledAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; } = DateTime.UtcNow;

    public static ShipmentOpsState CreateDefault(Shipment shipment)
    {
        var hasAgent = shipment.AssignedAgentId.HasValue;
        var hasVehicle = !string.IsNullOrWhiteSpace(shipment.VehicleNumber);
        var handoverState = HandoverState.Pending;

        if (shipment.Status == ShipmentStatus.Delivered)
        {
            handoverState = HandoverState.Completed;
        }
        else if (hasAgent && hasVehicle)
        {
            handoverState = HandoverState.Ready;
        }

        return new ShipmentOpsState
        {
            ShipmentId = shipment.ShipmentId,
            HandoverState = handoverState,
            RetryRequired = false,
            RetryCount = 0,
            UpdatedAtUtc = DateTime.UtcNow
        };
    }

    public bool SyncWithShipment(Shipment shipment)
    {
        var previous = HandoverState;

        if (shipment.Status == ShipmentStatus.Delivered)
        {
            HandoverState = HandoverState.Completed;
        }
        else if (HandoverState is not HandoverState.Exception and not HandoverState.Completed)
        {
            var hasAgent = shipment.AssignedAgentId.HasValue;
            var hasVehicle = !string.IsNullOrWhiteSpace(shipment.VehicleNumber);
            HandoverState = hasAgent && hasVehicle ? HandoverState.Ready : HandoverState.Pending;
        }

        var changed = previous != HandoverState;
        if (changed)
        {
            UpdatedAtUtc = DateTime.UtcNow;
        }

        return changed;
    }

    public void Update(
        HandoverState handoverState,
        string? handoverExceptionReason,
        bool retryRequired,
        int retryCount,
        string? retryReason,
        DateTime? nextRetryAtUtc,
        DateTime? lastRetryScheduledAtUtc)
    {
        HandoverState = handoverState;
        HandoverExceptionReason = NormalizeText(handoverExceptionReason);
        RetryRequired = retryRequired;
        RetryCount = Math.Clamp(retryCount, 0, 99);
        RetryReason = NormalizeText(retryReason);
        NextRetryAtUtc = ToUtcOrNull(nextRetryAtUtc);
        LastRetryScheduledAtUtc = ToUtcOrNull(lastRetryScheduledAtUtc);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    private static string? NormalizeText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    private static DateTime? ToUtcOrNull(DateTime? value)
    {
        if (value is null || value == default)
        {
            return null;
        }

        if (value.Value.Kind == DateTimeKind.Utc)
        {
            return value.Value;
        }

        return value.Value.ToUniversalTime();
    }
}