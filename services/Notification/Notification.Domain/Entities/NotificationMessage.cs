using Notification.Domain.Enums;

namespace Notification.Domain.Entities;

public sealed class NotificationMessage
{
    private static readonly HashSet<string> IdentityEmailEvents = new(StringComparer.Ordinal)
    {
        "dealerregistered",
        "passwordresetrequested",
        "passwordresetcompleted",
        "dealerapproved",
        "dealerrejected"
    };

    private static readonly HashSet<string> PaymentEmailEvents = new(StringComparer.Ordinal)
    {
        "dealercreditlimitupdated",
        "invoicegenerated",
        "paymentcaptured",
        "paymentfailed"
    };

    private static readonly HashSet<string> LogisticsEmailEvents = new(StringComparer.Ordinal)
    {
        "shipmentcreated",
        "shipmentassigned",
        "shipmentstatusupdated"
    };

    private static readonly HashSet<string> OrderExplicitEmailEvents = new(StringComparer.Ordinal)
    {
        "adminapprovalrequired",
        "orderplaced",
        "orderapproved",
        "ordercancelled",
        "returnrequested"
    };

    private NotificationMessage()
    {
    }

    public Guid NotificationId { get; private set; } = Guid.NewGuid();
    public Guid? RecipientUserId { get; private set; }
    public string Title { get; private set; } = string.Empty;
    public string Body { get; private set; } = string.Empty;
    public string SourceService { get; private set; } = string.Empty;
    public string EventType { get; private set; } = string.Empty;
    public NotificationChannel Channel { get; private set; } = NotificationChannel.InApp;
    public NotificationStatus Status { get; private set; } = NotificationStatus.Pending;
    public DateTime CreatedAtUtc { get; private set; } = DateTime.UtcNow;
    public DateTime? SentAtUtc { get; private set; }
    public string? FailureReason { get; private set; }

    public static NotificationMessage CreateManual(Guid? recipientUserId, string title, string body, NotificationChannel channel)
    {
        return new NotificationMessage
        {
            RecipientUserId = recipientUserId,
            Title = title.Trim(),
            Body = body.Trim(),
            SourceService = "Notification",
            EventType = "ManualNotification",
            Channel = channel
        };
    }

    public static NotificationMessage CreateFromEvent(string sourceService, string eventType, string payload, Guid? recipientUserId)
    {
        var normalizedSourceService = sourceService.Trim().ToLowerInvariant();
        var normalizedEventType = eventType.Trim().ToLowerInvariant();

        return new NotificationMessage
        {
            RecipientUserId = recipientUserId,
            Title = eventType.Trim(),
            Body = payload,
            SourceService = normalizedSourceService,
            EventType = normalizedEventType,
            Channel = ResolveChannel(normalizedSourceService, normalizedEventType)
        };
    }

    private static NotificationChannel ResolveChannel(string sourceService, string eventType)
    {
        if (sourceService == "identity" && IdentityEmailEvents.Contains(eventType))
        {
            return NotificationChannel.Email;
        }

        if (sourceService == "payment" && PaymentEmailEvents.Contains(eventType))
        {
            return NotificationChannel.Email;
        }

        if (sourceService == "logistics" && LogisticsEmailEvents.Contains(eventType))
        {
            return NotificationChannel.Email;
        }

        if (sourceService == "order" && (eventType.StartsWith("order", StringComparison.Ordinal) || OrderExplicitEmailEvents.Contains(eventType)))
        {
            return NotificationChannel.Email;
        }

        return NotificationChannel.InApp;
    }

    public void MarkSent()
    {
        Status = NotificationStatus.Sent;
        SentAtUtc = DateTime.UtcNow;
        FailureReason = null;
    }

    public void MarkFailed(string reason)
    {
        Status = NotificationStatus.Failed;
        FailureReason = reason.Trim();
    }
}
