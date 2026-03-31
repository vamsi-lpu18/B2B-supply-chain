using Notification.Application.DTOs;
using Notification.Domain.Entities;

namespace Notification.Application.Abstractions;

public interface INotificationService
{
    Task<NotificationDto> CreateManualAsync(CreateManualNotificationRequest request, CancellationToken cancellationToken);
    Task<NotificationDto> IngestIntegrationEventAsync(IngestIntegrationEventRequest request, CancellationToken cancellationToken);
    Task<NotificationDto?> GetByIdAsync(Guid notificationId, CancellationToken cancellationToken);
    Task<IReadOnlyList<NotificationDto>> GetByRecipientAsync(Guid recipientUserId, CancellationToken cancellationToken);
    Task<IReadOnlyList<NotificationDto>> GetAllAsync(CancellationToken cancellationToken);
    Task<bool> MarkSentAsync(Guid notificationId, CancellationToken cancellationToken);
    Task<bool> MarkFailedAsync(Guid notificationId, string reason, CancellationToken cancellationToken);
}

public interface INotificationRepository
{
    Task AddAsync(NotificationMessage message, CancellationToken cancellationToken);
    Task<NotificationMessage?> GetByIdAsync(Guid notificationId, CancellationToken cancellationToken);
    Task<IReadOnlyList<NotificationMessage>> GetByRecipientAsync(Guid recipientUserId, CancellationToken cancellationToken);
    Task<IReadOnlyList<NotificationMessage>> GetAllAsync(CancellationToken cancellationToken);
    Task AddOutboxMessageAsync(string eventType, object payload, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
