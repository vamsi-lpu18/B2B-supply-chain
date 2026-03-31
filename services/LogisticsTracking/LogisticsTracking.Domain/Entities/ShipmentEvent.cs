using LogisticsTracking.Domain.Enums;

namespace LogisticsTracking.Domain.Entities;

public sealed class ShipmentEvent
{
    private ShipmentEvent()
    {
    }

    public Guid ShipmentEventId { get; private set; }
    public Guid ShipmentId { get; private set; }
    public ShipmentStatus Status { get; private set; }
    public string Note { get; private set; } = string.Empty;
    public Guid UpdatedByUserId { get; private set; }
    public string UpdatedByRole { get; private set; } = string.Empty;
    public DateTime CreatedAtUtc { get; private set; } = DateTime.UtcNow;

    public static ShipmentEvent Create(Guid shipmentId, ShipmentStatus status, string note, Guid updatedByUserId, string updatedByRole)
    {
        return new ShipmentEvent
        {
            ShipmentId = shipmentId,
            Status = status,
            Note = note.Trim(),
            UpdatedByUserId = updatedByUserId,
            UpdatedByRole = updatedByRole.Trim()
        };
    }
}
