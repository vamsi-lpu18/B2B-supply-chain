using FluentValidation;
using Notification.Application.Abstractions;
using Notification.Application.DTOs;
using Notification.Domain.Entities;

namespace Notification.Application.Services;

public sealed class NotificationService(
    INotificationRepository notificationRepository,
    IValidator<CreateManualNotificationRequest> manualValidator,
    IValidator<IngestIntegrationEventRequest> ingestValidator,
    IValidator<MarkNotificationFailedRequest> failedValidator)
    : INotificationService
{
    public async Task<NotificationDto> CreateManualAsync(CreateManualNotificationRequest request, CancellationToken cancellationToken)
    {
        await manualValidator.ValidateAndThrowAsync(request, cancellationToken);

        var message = NotificationMessage.CreateManual(request.RecipientUserId, request.Title, request.Body, request.Channel);
        await notificationRepository.AddAsync(message, cancellationToken);

        await notificationRepository.AddOutboxMessageAsync("ManualNotificationCreated", new
        {
            message.NotificationId,
            message.RecipientUserId,
            message.Channel,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        await notificationRepository.SaveChangesAsync(cancellationToken);
        return Map(message);
    }

    public async Task<NotificationDto> IngestIntegrationEventAsync(IngestIntegrationEventRequest request, CancellationToken cancellationToken)
    {
        await ingestValidator.ValidateAndThrowAsync(request, cancellationToken);

        var message = NotificationMessage.CreateFromEvent(request.SourceService, request.EventType, request.Payload, request.RecipientUserId);
        await notificationRepository.AddAsync(message, cancellationToken);
        await notificationRepository.SaveChangesAsync(cancellationToken);

        return Map(message);
    }

    public async Task<NotificationDto?> GetByIdAsync(Guid notificationId, CancellationToken cancellationToken)
    {
        var message = await notificationRepository.GetByIdAsync(notificationId, cancellationToken);
        return message is null ? null : Map(message);
    }

    public async Task<IReadOnlyList<NotificationDto>> GetByRecipientAsync(Guid recipientUserId, CancellationToken cancellationToken)
    {
        var messages = await notificationRepository.GetByRecipientAsync(recipientUserId, cancellationToken);
        return messages.Select(Map).ToList();
    }

    public async Task<IReadOnlyList<NotificationDto>> GetAllAsync(CancellationToken cancellationToken)
    {
        var messages = await notificationRepository.GetAllAsync(cancellationToken);
        return messages.Select(Map).ToList();
    }

    public async Task<bool> MarkSentAsync(Guid notificationId, CancellationToken cancellationToken)
    {
        var message = await notificationRepository.GetByIdAsync(notificationId, cancellationToken);
        if (message is null)
        {
            return false;
        }

        message.MarkSent();
        await notificationRepository.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> MarkFailedAsync(Guid notificationId, string reason, CancellationToken cancellationToken)
    {
        await failedValidator.ValidateAndThrowAsync(new MarkNotificationFailedRequest(reason), cancellationToken);

        var message = await notificationRepository.GetByIdAsync(notificationId, cancellationToken);
        if (message is null)
        {
            return false;
        }

        message.MarkFailed(reason);
        await notificationRepository.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static NotificationDto Map(NotificationMessage message)
    {
        return new NotificationDto(
            message.NotificationId,
            message.RecipientUserId,
            message.Title,
            message.Body,
            message.SourceService,
            message.EventType,
            message.Channel,
            message.Status,
            message.CreatedAtUtc,
            message.SentAtUtc,
            message.FailureReason);
    }
}
