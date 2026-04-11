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

        shipment.UpdateStatus(ShipmentStatus.Delivered, "Delivered successfully", Guid.NewGuid(), "Agent");

        Assert.Equal(ShipmentStatus.Delivered, shipment.Status);
        Assert.NotNull(shipment.DeliveredAtUtc);
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
