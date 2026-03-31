namespace LogisticsTracking.Domain.Enums;

public enum ShipmentStatus
{
    Created = 0,
    Assigned = 1,
    PickedUp = 2,
    InTransit = 3,
    OutForDelivery = 4,
    Delivered = 5,
    DeliveryFailed = 6,
    Returned = 7
}
