using Notification.Domain.Enums;

namespace Notification.Application.DTOs;

public sealed record CreateManualNotificationRequest(
    Guid? RecipientUserId,
    string Title,
    string Body,
    NotificationChannel Channel);

public sealed record IngestIntegrationEventRequest(
    string SourceService,
    string EventType,
    string Payload,
    Guid? RecipientUserId);

public sealed record MarkNotificationFailedRequest(string FailureReason);

public sealed record NotificationDto(
    Guid NotificationId,
    Guid? RecipientUserId,
    string Title,
    string Body,
    string SourceService,
    string EventType,
    NotificationChannel Channel,
    NotificationStatus Status,
    DateTime CreatedAtUtc,
    DateTime? SentAtUtc,
    string? FailureReason);
