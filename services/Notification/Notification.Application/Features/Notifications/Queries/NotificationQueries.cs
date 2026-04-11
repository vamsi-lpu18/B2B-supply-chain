using MediatR;
using Notification.Application.Abstractions;
using Notification.Application.DTOs;

namespace Notification.Application.Features.Notifications;

public sealed record GetNotificationByIdQuery(Guid NotificationId) : IRequest<NotificationDto?>;

public sealed class GetNotificationByIdQueryHandler(INotificationService service)
    : IRequestHandler<GetNotificationByIdQuery, NotificationDto?>
{
    public Task<NotificationDto?> Handle(GetNotificationByIdQuery request, CancellationToken cancellationToken)
        => service.GetByIdAsync(request.NotificationId, cancellationToken);
}

public sealed record GetNotificationsByRecipientQuery(Guid RecipientUserId)
    : IRequest<IReadOnlyList<NotificationDto>>;

public sealed class GetNotificationsByRecipientQueryHandler(INotificationService service)
    : IRequestHandler<GetNotificationsByRecipientQuery, IReadOnlyList<NotificationDto>>
{
    public Task<IReadOnlyList<NotificationDto>> Handle(GetNotificationsByRecipientQuery request, CancellationToken cancellationToken)
        => service.GetByRecipientAsync(request.RecipientUserId, cancellationToken);
}

public sealed record GetAllNotificationsQuery : IRequest<IReadOnlyList<NotificationDto>>;

public sealed class GetAllNotificationsQueryHandler(INotificationService service)
    : IRequestHandler<GetAllNotificationsQuery, IReadOnlyList<NotificationDto>>
{
    public Task<IReadOnlyList<NotificationDto>> Handle(GetAllNotificationsQuery request, CancellationToken cancellationToken)
        => service.GetAllAsync(cancellationToken);
}
