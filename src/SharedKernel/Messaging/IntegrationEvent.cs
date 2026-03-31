namespace SharedKernel.Messaging;

public abstract record IntegrationEvent(Guid EventId, DateTime OccurredOnUtc);
