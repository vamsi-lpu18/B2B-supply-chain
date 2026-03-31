using LogisticsTracking.Domain.Enums;

namespace LogisticsTracking.Domain.Entities;

public sealed class Shipment
{
    private Shipment()
    {
    }

    public Guid ShipmentId { get; private set; } = Guid.NewGuid();
    public Guid OrderId { get; private set; }
    public Guid DealerId { get; private set; }
    public string ShipmentNumber { get; private set; } = string.Empty;
    public string DeliveryAddress { get; private set; } = string.Empty;
    public string City { get; private set; } = string.Empty;
    public string State { get; private set; } = string.Empty;
    public string PostalCode { get; private set; } = string.Empty;
    public Guid? AssignedAgentId { get; private set; }
    public string? VehicleNumber { get; private set; }
    public ShipmentStatus Status { get; private set; } = ShipmentStatus.Created;
    public DateTime CreatedAtUtc { get; private set; } = DateTime.UtcNow;
    public DateTime? DeliveredAtUtc { get; private set; }

    public ICollection<ShipmentEvent> Events { get; private set; } = new List<ShipmentEvent>();

    public static Shipment Create(Guid orderId, Guid dealerId, string shipmentNumber, string deliveryAddress, string city, string state, string postalCode, Guid createdByUserId, string createdByRole)
    {
        var shipment = new Shipment
        {
            OrderId = orderId,
            DealerId = dealerId,
            ShipmentNumber = shipmentNumber.Trim().ToUpperInvariant(),
            DeliveryAddress = deliveryAddress.Trim(),
            City = city.Trim(),
            State = state.Trim(),
            PostalCode = postalCode.Trim()
        };

        shipment.AddEvent(ShipmentStatus.Created, "Shipment created", createdByUserId, createdByRole);
        return shipment;
    }

    public void AssignAgent(Guid agentId, Guid updatedByUserId, string updatedByRole)
    {
        AssignedAgentId = agentId;
        if (Status == ShipmentStatus.Created)
        {
            Status = ShipmentStatus.Assigned;
        }

        AddEvent(ShipmentStatus.Assigned, $"Assigned to agent {agentId}", updatedByUserId, updatedByRole);
    }

    public void AssignVehicle(string vehicleNumber, Guid updatedByUserId, string updatedByRole)
    {
        var normalized = vehicleNumber.Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new InvalidOperationException("Vehicle number is required.");
        }

        if (Status == ShipmentStatus.Delivered || Status == ShipmentStatus.Returned)
        {
            throw new InvalidOperationException("Vehicle cannot be assigned after shipment completion.");
        }

        if (string.Equals(VehicleNumber, normalized, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        VehicleNumber = normalized;
        if (Status == ShipmentStatus.Created)
        {
            Status = ShipmentStatus.Assigned;
        }

        AddEvent(Status, $"Vehicle assigned: {normalized}", updatedByUserId, updatedByRole);
    }

    public void UpdateStatus(ShipmentStatus newStatus, string note, Guid updatedByUserId, string updatedByRole)
    {
        if (Status == ShipmentStatus.Delivered || Status == ShipmentStatus.Returned)
        {
            throw new InvalidOperationException("Shipment is already completed and cannot be updated.");
        }

        Status = newStatus;
        if (newStatus == ShipmentStatus.Delivered)
        {
            DeliveredAtUtc = DateTime.UtcNow;
        }

        AddEvent(newStatus, note, updatedByUserId, updatedByRole);
    }

    private void AddEvent(ShipmentStatus status, string note, Guid updatedByUserId, string updatedByRole)
    {
        Events.Add(ShipmentEvent.Create(ShipmentId, status, note, updatedByUserId, updatedByRole));
    }
}
