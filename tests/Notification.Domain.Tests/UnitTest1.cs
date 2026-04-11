using Notification.Domain.Entities;
using Notification.Domain.Enums;

namespace Notification.Domain.Tests;

public sealed class NotificationMessageTests
{
    [Fact]
    public void CreateFromEvent_IdentityPasswordReset_UsesEmailChannel()
    {
        var message = NotificationMessage.CreateFromEvent("Identity", "PasswordResetRequested", "payload", Guid.NewGuid());

        Assert.Equal(NotificationChannel.Email, message.Channel);
        Assert.Equal("identity", message.SourceService);
        Assert.Equal("passwordresetrequested", message.EventType);
    }

    [Fact]
    public void CreateFromEvent_UnknownEvent_FallsBackToInApp()
    {
        var message = NotificationMessage.CreateFromEvent("Catalog", "StockViewed", "payload", Guid.NewGuid());

        Assert.Equal(NotificationChannel.InApp, message.Channel);
    }

    [Fact]
    public void MarkFailed_SetsFailedStatusAndTrimmedReason()
    {
        var message = NotificationMessage.CreateManual(Guid.NewGuid(), "Title", "Body", NotificationChannel.Email);

        message.MarkFailed("  SMTP timeout  ");

        Assert.Equal(NotificationStatus.Failed, message.Status);
        Assert.Equal("SMTP timeout", message.FailureReason);
    }

    [Fact]
    public void MarkSent_ClearsFailureReasonAndSetsSentTimestamp()
    {
        var message = NotificationMessage.CreateManual(Guid.NewGuid(), "Title", "Body", NotificationChannel.Email);
        message.MarkFailed("temporary error");

        message.MarkSent();

        Assert.Equal(NotificationStatus.Sent, message.Status);
        Assert.Null(message.FailureReason);
        Assert.NotNull(message.SentAtUtc);
    }
}
