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
    public AssignmentDecisionStatus AssignmentDecisionStatus { get; private set; } = AssignmentDecisionStatus.Pending;
    public string? AssignmentDecisionReason { get; private set; }
    public DateTime? AssignmentDecisionAtUtc { get; private set; }
    public int? DeliveryAgentRating { get; private set; }
    public string? DeliveryAgentRatingComment { get; private set; }
    public DateTime? DeliveryAgentRatedAtUtc { get; private set; }
    public Guid? DeliveryAgentRatedByUserId { get; private set; }
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
        AssignmentDecisionStatus = AssignmentDecisionStatus.Pending;
        AssignmentDecisionReason = null;
        AssignmentDecisionAtUtc = null;

        if (Status == ShipmentStatus.Created)
        {
            Status = ShipmentStatus.Assigned;
        }

        AddEvent(ShipmentStatus.Assigned, $"Assigned to agent {agentId}", updatedByUserId, updatedByRole);
    }

    public void AcceptAssignment(Guid updatedByUserId, string updatedByRole)
    {
        if (!AssignedAgentId.HasValue)
        {
            throw new InvalidOperationException("No agent is assigned to this shipment.");
        }

        if (Status == ShipmentStatus.Delivered || Status == ShipmentStatus.Returned)
        {
            throw new InvalidOperationException("Assignment cannot be accepted after shipment completion.");
        }

        AssignmentDecisionStatus = AssignmentDecisionStatus.Accepted;
        AssignmentDecisionReason = null;
        AssignmentDecisionAtUtc = DateTime.UtcNow;

        if (Status == ShipmentStatus.Created)
        {
            Status = ShipmentStatus.Assigned;
        }

        AddEvent(Status, "Assignment accepted by assigned agent.", updatedByUserId, updatedByRole);
    }

    public void RejectAssignment(string reason, Guid updatedByUserId, string updatedByRole)
    {
        if (!AssignedAgentId.HasValue)
        {
            throw new InvalidOperationException("No agent is assigned to this shipment.");
        }

        if (Status == ShipmentStatus.Delivered || Status == ShipmentStatus.Returned)
        {
            throw new InvalidOperationException("Assignment cannot be rejected after shipment completion.");
        }

        var normalizedReason = reason.Trim();
        if (string.IsNullOrWhiteSpace(normalizedReason))
        {
            throw new InvalidOperationException("Rejection reason is required.");
        }

        var rejectedAgentId = AssignedAgentId.Value;

        AssignmentDecisionStatus = AssignmentDecisionStatus.Rejected;
        AssignmentDecisionReason = normalizedReason;
        AssignmentDecisionAtUtc = DateTime.UtcNow;
        AssignedAgentId = null;

        if (string.IsNullOrWhiteSpace(VehicleNumber))
        {
            Status = ShipmentStatus.Created;
        }
        else
        {
            Status = ShipmentStatus.Assigned;
        }

        AddEvent(Status, $"Assignment rejected by agent {rejectedAgentId}. Reason: {normalizedReason}", updatedByUserId, updatedByRole);
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

    public void RateDeliveryAgent(int rating, string? comment, Guid ratedByUserId, string ratedByRole)
    {
        if (!AssignedAgentId.HasValue)
        {
            throw new InvalidOperationException("No delivery agent is assigned to this shipment.");
        }

        if (Status != ShipmentStatus.Delivered)
        {
            throw new InvalidOperationException("Delivery agent can be rated only after shipment is delivered.");
        }

        if (rating is < 1 or > 5)
        {
            throw new InvalidOperationException("Delivery agent rating must be between 1 and 5.");
        }

        var normalizedComment = comment?.Trim();
        if (!string.IsNullOrEmpty(normalizedComment) && normalizedComment.Length > 500)
        {
            throw new InvalidOperationException("Delivery agent rating comment cannot exceed 500 characters.");
        }

        DeliveryAgentRating = rating;
        DeliveryAgentRatingComment = string.IsNullOrWhiteSpace(normalizedComment) ? null : normalizedComment;
        DeliveryAgentRatedAtUtc = DateTime.UtcNow;
        DeliveryAgentRatedByUserId = ratedByUserId;

        var note = DeliveryAgentRatingComment is null
            ? $"Delivery agent rated {rating}/5 by dealer."
            : $"Delivery agent rated {rating}/5 by dealer. Comment: {DeliveryAgentRatingComment}";

        AddEvent(Status, note, ratedByUserId, ratedByRole);
    }

    public void UpdateStatus(ShipmentStatus newStatus, string note, Guid updatedByUserId, string updatedByRole)
    {
        if (Status == ShipmentStatus.Delivered || Status == ShipmentStatus.Returned)
        {
            throw new InvalidOperationException("Shipment is already completed and cannot be updated.");
        }

        if (newStatus == ShipmentStatus.Delivered && string.IsNullOrWhiteSpace(VehicleNumber))
        {
            throw new InvalidOperationException("Vehicle must be assigned before marking shipment as Delivered.");
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
