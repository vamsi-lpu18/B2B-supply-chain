namespace BuildingBlocks.Persistence;

public enum OutboxStatus
{
    Pending = 0,
    Published = 1,
    Failed = 2
}
