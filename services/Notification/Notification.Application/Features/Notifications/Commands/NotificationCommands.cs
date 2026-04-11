using MediatR;
using Notification.Application.Abstractions;
using Notification.Application.DTOs;

namespace Notification.Application.Features.Notifications;

public sealed record CreateManualNotificationCommand(CreateManualNotificationRequest Request)
    : IRequest<NotificationDto>;

public sealed class CreateManualNotificationCommandHandler(INotificationService service)
    : IRequestHandler<CreateManualNotificationCommand, NotificationDto>
{
    public Task<NotificationDto> Handle(CreateManualNotificationCommand request, CancellationToken cancellationToken)
        => service.CreateManualAsync(request.Request, cancellationToken);
}

public sealed record IngestIntegrationEventCommand(IngestIntegrationEventRequest Request)
    : IRequest<NotificationDto>;

public sealed class IngestIntegrationEventCommandHandler(INotificationService service)
    : IRequestHandler<IngestIntegrationEventCommand, NotificationDto>
{
    public Task<NotificationDto> Handle(IngestIntegrationEventCommand request, CancellationToken cancellationToken)
        => service.IngestIntegrationEventAsync(request.Request, cancellationToken);
}

public sealed record MarkNotificationSentCommand(Guid NotificationId) : IRequest<bool>;

public sealed class MarkNotificationSentCommandHandler(INotificationService service)
    : IRequestHandler<MarkNotificationSentCommand, bool>
{
    public Task<bool> Handle(MarkNotificationSentCommand request, CancellationToken cancellationToken)
        => service.MarkSentAsync(request.NotificationId, cancellationToken);
}

public sealed record MarkNotificationFailedCommand(Guid NotificationId, string Reason) : IRequest<bool>;

public sealed class MarkNotificationFailedCommandHandler(INotificationService service)
    : IRequestHandler<MarkNotificationFailedCommand, bool>
{
    public Task<bool> Handle(MarkNotificationFailedCommand request, CancellationToken cancellationToken)
        => service.MarkFailedAsync(request.NotificationId, request.Reason, cancellationToken);
}

public sealed record MarkNotificationReadCommand(Guid NotificationId) : IRequest<bool>;

public sealed class MarkNotificationReadCommandHandler(INotificationService service)
    : IRequestHandler<MarkNotificationReadCommand, bool>
{
    public Task<bool> Handle(MarkNotificationReadCommand request, CancellationToken cancellationToken)
        => service.MarkReadAsync(request.NotificationId, cancellationToken);
}

public sealed record MarkNotificationUnreadCommand(Guid NotificationId) : IRequest<bool>;

public sealed class MarkNotificationUnreadCommandHandler(INotificationService service)
    : IRequestHandler<MarkNotificationUnreadCommand, bool>
{
    public Task<bool> Handle(MarkNotificationUnreadCommand request, CancellationToken cancellationToken)
        => service.MarkUnreadAsync(request.NotificationId, cancellationToken);
}
