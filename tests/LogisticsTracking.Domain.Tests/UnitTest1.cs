using LogisticsTracking.Domain.Entities;
using LogisticsTracking.Domain.Enums;

namespace LogisticsTracking.Domain.Tests;

public sealed class ShipmentTests
{
    [Fact]
    public void Create_InitializesCreatedStateAndFirstEvent()
    {
        var shipment = CreateShipment();

        Assert.Equal(ShipmentStatus.Created, shipment.Status);
        Assert.Single(shipment.Events);
        Assert.Equal("SHP-1001", shipment.ShipmentNumber);
    }

    [Fact]
    public void AssignAgent_FromCreated_MovesToAssignedAndAddsEvent()
    {
        var shipment = CreateShipment();
        var agentId = Guid.NewGuid();

        shipment.AssignAgent(agentId, Guid.NewGuid(), "Logistics");

        Assert.Equal(agentId, shipment.AssignedAgentId);
        Assert.Equal(ShipmentStatus.Assigned, shipment.Status);
        Assert.Equal(2, shipment.Events.Count);
    }

    [Fact]
    public void AssignVehicle_BlankValue_Throws()
    {
        var shipment = CreateShipment();

        Assert.Throws<InvalidOperationException>(() =>
            shipment.AssignVehicle("   ", Guid.NewGuid(), "Logistics"));
    }

    [Fact]
    public void UpdateStatus_ToDelivered_SetsDeliveredTimestamp()
    {
        var shipment = CreateShipment();
        shipment.AssignVehicle("TS09AB1234", Guid.NewGuid(), "Logistics");

        shipment.UpdateStatus(ShipmentStatus.Delivered, "Delivered successfully", Guid.NewGuid(), "Agent");

        Assert.Equal(ShipmentStatus.Delivered, shipment.Status);
        Assert.NotNull(shipment.DeliveredAtUtc);
    }

    [Fact]
    public void UpdateStatus_ToDelivered_WithoutVehicle_Throws()
    {
        var shipment = CreateShipment();

        var ex = Assert.Throws<InvalidOperationException>(() =>
            shipment.UpdateStatus(ShipmentStatus.Delivered, "Delivered successfully", Guid.NewGuid(), "Agent"));

        Assert.Equal("Vehicle must be assigned before marking shipment as Delivered.", ex.Message);
    }

    [Fact]
    public void RateDeliveryAgent_AfterDelivery_PersistsRatingDetails()
    {
        var shipment = CreateShipment();
        var agentId = Guid.NewGuid();
        var dealerId = Guid.NewGuid();

        shipment.AssignAgent(agentId, Guid.NewGuid(), "Logistics");
        shipment.AssignVehicle("TS09AB1234", Guid.NewGuid(), "Logistics");
        shipment.UpdateStatus(ShipmentStatus.Delivered, "Delivered", Guid.NewGuid(), "Agent");

        shipment.RateDeliveryAgent(5, "Smooth and professional delivery", dealerId, "Dealer");

        Assert.Equal(5, shipment.DeliveryAgentRating);
        Assert.Equal("Smooth and professional delivery", shipment.DeliveryAgentRatingComment);
        Assert.Equal(dealerId, shipment.DeliveryAgentRatedByUserId);
        Assert.NotNull(shipment.DeliveryAgentRatedAtUtc);
    }

    [Fact]
    public void RateDeliveryAgent_BeforeDelivery_Throws()
    {
        var shipment = CreateShipment();
        shipment.AssignAgent(Guid.NewGuid(), Guid.NewGuid(), "Logistics");

        Assert.Throws<InvalidOperationException>(() =>
            shipment.RateDeliveryAgent(4, "Too early", Guid.NewGuid(), "Dealer"));
    }

    private static Shipment CreateShipment()
    {
        return Shipment.Create(
            Guid.NewGuid(),
            Guid.NewGuid(),
            "shp-1001",
            "12 Market Street",
            "Hyderabad",
            "Telangana",
            "500001",
            Guid.NewGuid(),
            "Warehouse");
    }
}
