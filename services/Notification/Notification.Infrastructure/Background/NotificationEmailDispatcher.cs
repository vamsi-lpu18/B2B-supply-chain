using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Notification.Domain.Enums;
using Notification.Infrastructure.Email;
using Notification.Infrastructure.Integrations;
using Notification.Infrastructure.Persistence;
using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Notification.Infrastructure.Background;

internal sealed class NotificationEmailDispatcher(
    IServiceScopeFactory scopeFactory,
    IOptions<EmailSettings> emailSettings,
    ILogger<NotificationEmailDispatcher> logger) : BackgroundService
{
    private const int BatchSize = 20;
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(5);
    private static readonly string[] WorkflowKeyCandidates =
    [
        "orderId",
        "invoiceId",
        "shipmentId",
        "dealerId",
        "paymentId",
        "returnRequestId"
    ];

    private static readonly HashSet<string> ImmediateEventTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "passwordresetrequested",
        "passwordresetcompleted"
    };

    // Enterprise default: use externally hosted AI-generated hero images; fallback SVG is used when unavailable.
    private static readonly IReadOnlyDictionary<string, string> EnterpriseAiHeroImageUrls =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["identity"] = "https://image.pollinations.ai/prompt/enterprise%20cybersecurity%20operations%20center%20futuristic%20dashboard%20blue%20clean%20corporate%20style?width=1200&height=320&nologo=true",
            ["order"] = "https://image.pollinations.ai/prompt/enterprise%20order%20management%20workflow%20operations%20room%20clean%20corporate%20indigo%20lighting?width=1200&height=320&nologo=true",
            ["payment"] = "https://image.pollinations.ai/prompt/enterprise%20digital%20finance%20and%20invoice%20operations%20green%20professional%20interface?width=1200&height=320&nologo=true",
            ["logistics"] = "https://image.pollinations.ai/prompt/enterprise%20global%20logistics%20control%20tower%20supply%20chain%20tracking%20orange%20professional?width=1200&height=320&nologo=true",
            ["digest"] = "https://image.pollinations.ai/prompt/enterprise%20executive%20summary%20dashboard%20multi%20workflow%20insights%20clean%20teal?width=1200&height=320&nologo=true",
            ["default"] = "https://image.pollinations.ai/prompt/enterprise%20supply%20chain%20platform%20notification%20dashboard%20minimal%20professional?width=1200&height=320&nologo=true"
        };

    private sealed record ResolvedEmailNotification(
        Notification.Domain.Entities.NotificationMessage Message,
        string RecipientEmail,
        string WorkflowKey);

    private sealed record EmailTheme(
        string WrapperStart,
        string WrapperMid,
        string WrapperEnd,
        string AccentStart,
        string AccentEnd,
        string BadgeBackground,
        string BadgeText,
        string BadgeBorder,
        string LeadColor,
        string DetailKeyColor,
        string HeroTitle,
        string HeroSubtitle);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!emailSettings.Value.Enabled)
                {
                    await Task.Delay(PollInterval, stoppingToken);
                    continue;
                }

                using var scope = scopeFactory.CreateScope();
                var dbContext = scope.ServiceProvider.GetRequiredService<NotificationDbContext>();
                var emailSender = scope.ServiceProvider.GetRequiredService<SmtpEmailSender>();
                var identityClient = scope.ServiceProvider.GetRequiredService<IdentityUserContactClient>();

                var pendingEmailNotifications = await dbContext.Notifications
                    .Where(x => x.Channel == NotificationChannel.Email && x.Status == NotificationStatus.Pending)
                    .OrderBy(x => x.CreatedAtUtc)
                    .Take(BatchSize)
                    .ToListAsync(stoppingToken);

                if (pendingEmailNotifications.Count == 0)
                {
                    await Task.Delay(PollInterval, stoppingToken);
                    continue;
                }

                var resolvedNotifications = new List<ResolvedEmailNotification>();
                foreach (var message in pendingEmailNotifications)
                {
                    try
                    {
                        var recipientEmail = await ResolveRecipientEmailAsync(message, identityClient, stoppingToken);
                        if (string.IsNullOrWhiteSpace(recipientEmail))
                        {
                            message.MarkFailed("Recipient email could not be resolved.");
                            continue;
                        }

                        resolvedNotifications.Add(new ResolvedEmailNotification(
                            message,
                            recipientEmail,
                            ResolveWorkflowKey(message.Body)));
                    }
                    catch (Exception ex)
                    {
                        logger.LogError(ex, "Failed to prepare email notification {NotificationId}", message.NotificationId);
                        var reason = ex.Message.Length > 900 ? ex.Message[..900] : ex.Message;
                        message.MarkFailed(reason);
                    }
                }

                var immediateNotifications = resolvedNotifications
                    .Where(x => IsImmediateEmailEvent(x.Message.SourceService, x.Message.EventType))
                    .ToList();

                foreach (var notification in immediateNotifications)
                {
                    await TrySendSingleNotificationAsync(notification, emailSender);
                }

                var digestCandidates = resolvedNotifications
                    .Where(x => !IsImmediateEmailEvent(x.Message.SourceService, x.Message.EventType))
                    .ToList();

                var digestGroups = digestCandidates
                    .GroupBy(
                        x => BuildDigestGroupKey(x.RecipientEmail, x.WorkflowKey),
                        StringComparer.OrdinalIgnoreCase)
                    .ToList();

                foreach (var group in digestGroups)
                {
                    var ordered = group
                        .OrderBy(x => x.Message.CreatedAtUtc)
                        .ToList();

                    if (ordered.Count == 1)
                    {
                        await TrySendSingleNotificationAsync(ordered[0], emailSender);
                        continue;
                    }

                    await TrySendDigestAsync(ordered, emailSender);
                }

                await dbContext.SaveChangesAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Unexpected notification email dispatcher error.");
            }

            await Task.Delay(PollInterval, stoppingToken);
        }
    }

    private async Task TrySendSingleNotificationAsync(ResolvedEmailNotification notification, SmtpEmailSender emailSender)
    {
        try
        {
            logger.LogInformation(
                "Sending single notification email to {RecipientEmail} notificationId={NotificationId} source={SourceService} event={EventType}",
                notification.RecipientEmail,
                notification.Message.NotificationId,
                notification.Message.SourceService,
                notification.Message.EventType);

            await emailSender.SendAsync(
                notification.RecipientEmail,
                BuildSubject(notification.Message.SourceService, notification.Message.EventType),
                BuildBody(notification.Message.SourceService, notification.Message.EventType, notification.Message.Body));

            notification.Message.MarkSent();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to send email notification {NotificationId}", notification.Message.NotificationId);
            var reason = ex.Message.Length > 900 ? ex.Message[..900] : ex.Message;
            notification.Message.MarkFailed(reason);
        }
    }

    private async Task TrySendDigestAsync(
        IReadOnlyList<ResolvedEmailNotification> notifications,
        SmtpEmailSender emailSender)
    {
        var first = notifications[0];

        try
        {
            logger.LogInformation(
                "Sending digest email to {RecipientEmail} notificationCount={Count} workflowKey={WorkflowKey}",
                first.RecipientEmail,
                notifications.Count,
                first.WorkflowKey);

            await emailSender.SendAsync(
                first.RecipientEmail,
                BuildDigestSubject(notifications),
                BuildDigestBody(notifications));

            foreach (var notification in notifications)
            {
                notification.Message.MarkSent();
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "Failed to send digest email to {RecipientEmail}. Notification count {Count}",
                first.RecipientEmail,
                notifications.Count);

            var reason = ex.Message.Length > 900 ? ex.Message[..900] : ex.Message;
            foreach (var notification in notifications)
            {
                notification.Message.MarkFailed(reason);
            }
        }
    }

    private static string BuildDigestGroupKey(string recipientEmail, string workflowKey)
    {
        return recipientEmail.Trim().ToLowerInvariant() + "|" + workflowKey.Trim().ToLowerInvariant();
    }

    private static bool IsImmediateEmailEvent(string sourceService, string eventType)
    {
        return string.Equals(sourceService, "identity", StringComparison.OrdinalIgnoreCase)
               && ImmediateEventTypes.Contains(eventType);
    }

    private static async Task<string?> ResolveRecipientEmailAsync(
        Notification.Domain.Entities.NotificationMessage message,
        IdentityUserContactClient identityClient,
        CancellationToken cancellationToken)
    {
        var recipientEmail = TryGetPayloadString(message.Body, "Email");
        if (!string.IsNullOrWhiteSpace(recipientEmail))
        {
            return recipientEmail;
        }

        if (!message.RecipientUserId.HasValue)
        {
            return null;
        }

        return await identityClient.ResolveEmailAsync(message.RecipientUserId.Value, cancellationToken);
    }

    private static string ResolveWorkflowKey(string payload)
    {
        foreach (var property in WorkflowKeyCandidates)
        {
            var value = TryGetPayloadString(payload, property);
            if (!string.IsNullOrWhiteSpace(value))
            {
                return property + ":" + value;
            }
        }

        return "general";
    }

    private static string BuildSubject(string sourceService, string eventType)
    {
        return (sourceService, eventType) switch
        {
            ("identity", "dealerregistered") => "Dealer Registration Acknowledgement",
            ("identity", "passwordresetrequested") => "Password Reset Verification Code",
            ("identity", "passwordresetcompleted") => "Password Reset Confirmation",
            ("identity", "dealerapproved") => "Dealer Account Approval Confirmation",
            ("identity", "dealerrejected") => "Dealer Account Review Update",
            ("payment", "dealercreditlimitupdated") => "Credit Limit Update Notice",
            ("payment", "invoicegenerated") => "Invoice Generation Confirmation",
            ("payment", "paymentcaptured") => "Payment Confirmation",
            ("payment", "paymentfailed") => "Payment Processing Update",
            ("order", "adminapprovalrequired") => "Order Approval Required",
            ("order", "orderplaced") => "Order Placement Confirmation",
            ("order", "orderapproved") => "Order Approval Confirmation",
            ("order", "ordercancelled") => "Order Cancellation Notice",
            ("order", "returnrequested") => "Return Request Received",
            ("logistics", "shipmentcreated") => "Shipment Created",
            ("logistics", "shipmentassigned") => "Shipment Assignment Confirmation",
            ("logistics", "shipmentstatusupdated") => "Shipment Status Update",
            _ when sourceService == "order" && eventType.StartsWith("order", StringComparison.Ordinal) => "Order Status Update",
            _ => $"Platform Notification: {ToDisplayText(eventType)}"
        };
    }

    private static string BuildDigestSubject(IReadOnlyList<ResolvedEmailNotification> notifications)
    {
        var services = notifications
            .Select(x => ToDisplayText(x.Message.SourceService))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (services.Length == 1)
        {
            return $"{services[0]} Updates Digest ({notifications.Count})";
        }

        return $"Supply Chain Workflow Digest ({notifications.Count} updates)";
    }

    private static string BuildBody(string sourceService, string eventType, string payload)
    {
        return (sourceService, eventType) switch
        {
            ("identity", "passwordresetrequested") => BuildPasswordResetRequestedBody(payload),
            ("identity", "passwordresetcompleted") => BuildPasswordResetCompletedBody(),
            _ => BuildStandardNotificationBody(sourceService, eventType, payload)
        };
    }

    private static string BuildDigestBody(IReadOnlyList<ResolvedEmailNotification> notifications)
    {
        var first = notifications[0];
        var firstTimestamp = notifications.Min(x => x.Message.CreatedAtUtc);
        var lastTimestamp = notifications.Max(x => x.Message.CreatedAtUtc);
        var serviceList = string.Join(", ",
            notifications
                .Select(x => ToDisplayText(x.Message.SourceService))
                .Distinct(StringComparer.OrdinalIgnoreCase));

        var details = new List<(string Label, string Value)>
        {
            ("Total Updates", notifications.Count.ToString()),
            ("Services", serviceList),
            ("Time Window", $"{firstTimestamp:yyyy-MM-dd HH:mm:ss} UTC to {lastTimestamp:yyyy-MM-dd HH:mm:ss} UTC")
        };

        if (!string.Equals(first.WorkflowKey, "general", StringComparison.OrdinalIgnoreCase))
        {
            details.Add(("Workflow Reference", first.WorkflowKey));
        }

        var bodyHtml = $$"""
<p class="lead">You have {{notifications.Count}} related updates grouped into one clear email.</p>
<p>These events were merged to reduce duplicate notifications and keep your workflow history easy to scan.</p>
{{BuildDigestEventsHtml(notifications)}}
""";

        return BuildBrandedHtmlEmail(
            sourceService: "digest",
            eventType: "workflowdigest",
            headline: "Workflow Update Digest",
            badge: "Digest",
            preheader: $"{notifications.Count} related updates merged into one summary email.",
            bodyHtml: bodyHtml,
            details: details);
    }

    private static string BuildDigestEventsHtml(IReadOnlyList<ResolvedEmailNotification> notifications)
    {
        var builder = new StringBuilder();
        builder.Append("<div class=\"digest-list\">");

        foreach (var notification in notifications)
        {
            var message = notification.Message;
            var serviceText = ToDisplayText(message.SourceService);
            var eventText = ToDisplayText(message.EventType);
            var timestamp = message.CreatedAtUtc.ToString("yyyy-MM-dd HH:mm:ss") + " UTC";
            var previewRows = TryFormatPayloadRows(message.Body)
                .Take(3)
                .Select(row => HtmlEncode(row.Label) + ": " + HtmlEncode(row.Value));
            var preview = string.Join("<br>", previewRows);

            if (string.IsNullOrWhiteSpace(preview))
            {
                preview = "No additional details provided.";
            }

            var theme = ResolveTheme(message.SourceService);

            builder.Append("<div class=\"digest-item\" style=\"border-left-color:");
            builder.Append(theme.AccentStart);
            builder.Append("\">\n");
            builder.Append("<div class=\"digest-title\">");
            builder.Append(HtmlEncode(eventText));
            builder.Append("</div>\n");
            builder.Append("<div class=\"digest-meta\">");
            builder.Append(HtmlEncode(serviceText));
            builder.Append(" | ");
            builder.Append(HtmlEncode(timestamp));
            builder.Append("</div>\n");
            builder.Append("<div class=\"digest-preview\">");
            builder.Append(preview);
            builder.Append("</div>\n");
            builder.Append("</div>");
        }

        builder.Append("</div>");
        return builder.ToString();
    }

    private static string BuildPasswordResetRequestedBody(string payload)
    {
        var otp = TryGetPayloadString(payload, "otpCode") ?? "Not available";
        var expiry = TryGetPayloadString(payload, "expiresAtUtc") ?? "Not available";

        var bodyHtml = $$"""
<p class="lead">We received a request to reset the password for your Supply Chain Platform account.</p>
<p>Use the one-time password (OTP) below to continue. For your security, do not share this code with anyone.</p>
<div class="otp-box">{{HtmlEncode(otp)}}</div>
<p class="muted">If you did not request a password reset, you can safely ignore this email.</p>
""";

        return BuildBrandedHtmlEmail(
            sourceService: "identity",
            eventType: "passwordresetrequested",
            headline: "Password Reset Verification",
            badge: "Security",
            preheader: "Use your OTP to reset your password securely.",
            bodyHtml: bodyHtml,
            details: [("Valid Until (UTC)", expiry)]);
    }

    private static string BuildPasswordResetCompletedBody()
    {
        const string bodyHtml = """
<p class="lead">Your Supply Chain Platform password has been reset successfully.</p>
<p>If this action was not performed by you, please contact support immediately and secure your account.</p>
<p class="muted">Tip: use a strong, unique password and enable regular password updates.</p>
""";

        return BuildBrandedHtmlEmail(
            sourceService: "identity",
            eventType: "passwordresetcompleted",
            headline: "Password Reset Complete",
            badge: "Account",
            preheader: "Your password was changed successfully.",
            bodyHtml: bodyHtml,
            details: []);
    }

    private static string BuildStandardNotificationBody(string sourceService, string eventType, string payload)
    {
        var serviceLabel = ToDisplayText(sourceService);
        var eventLabel = ToDisplayText(eventType);

        var bodyHtml = $$"""
<p class="lead">There is a new update from your Supply Chain Platform account.</p>
<p>This message summarizes the latest event in a clean format so you can review it quickly.</p>
""";

        var details = TryFormatPayloadRows(payload);
        details.Insert(0, ("Service", serviceLabel));
        details.Insert(1, ("Notification Type", eventLabel));

        return BuildBrandedHtmlEmail(
            sourceService,
            eventType,
            headline: eventLabel,
            badge: serviceLabel,
            preheader: $"Update from {serviceLabel}: {eventLabel}",
            bodyHtml,
            details);
    }

    private static string? TryGetPayloadString(string payload, string propertyName)
    {
        try
        {
            using var document = JsonDocument.Parse(payload);
            return TryFindPayloadString(document.RootElement, propertyName);
        }
        catch
        {
            return null;
        }
    }

    private static string? TryFindPayloadString(JsonElement element, string propertyName)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var property in element.EnumerateObject())
                {
                    if (string.Equals(property.Name, propertyName, StringComparison.OrdinalIgnoreCase))
                    {
                        return property.Value.ValueKind switch
                        {
                            JsonValueKind.String => property.Value.GetString(),
                            JsonValueKind.Number => property.Value.GetRawText(),
                            JsonValueKind.True => "true",
                            JsonValueKind.False => "false",
                            _ => null
                        };
                    }

                    var nested = TryFindPayloadString(property.Value, propertyName);
                    if (!string.IsNullOrWhiteSpace(nested))
                    {
                        return nested;
                    }
                }

                break;

            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray())
                {
                    var nested = TryFindPayloadString(item, propertyName);
                    if (!string.IsNullOrWhiteSpace(nested))
                    {
                        return nested;
                    }
                }

                break;
        }

        return null;
    }

    private static List<(string Label, string Value)> TryFormatPayloadRows(string payload)
    {
        try
        {
            using var document = JsonDocument.Parse(payload);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return [("Payload", TrimValue(payload))];
            }

            var lines = new List<(string Label, string Value)>();
            foreach (var property in document.RootElement.EnumerateObject())
            {
                var key = ToDisplayText(property.Name);
                var value = FormatJsonValue(property.Value);
                lines.Add((key, TrimValue(value)));
            }

            return lines.Count > 0 ? lines : [("Details", "No additional details provided.")];
        }
        catch
        {
            return [("Payload", TrimValue(payload))];
        }
    }

    private static string FormatJsonValue(JsonElement value)
    {
        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString() ?? string.Empty,
            JsonValueKind.Number => value.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            JsonValueKind.Null => "null",
            _ => value.GetRawText()
        };
    }

    private static string TrimValue(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "-";
        }

        return value.Length > 260 ? value[..260] + "..." : value;
    }

    private static string BuildBrandedHtmlEmail(
        string sourceService,
        string eventType,
        string headline,
        string badge,
        string preheader,
        string bodyHtml,
        IReadOnlyList<(string Label, string Value)> details)
    {
        var detailsHtml = BuildDetailsRowsHtml(details);
        var theme = ResolveTheme(sourceService);
        var serviceLabel = ToDisplayText(sourceService);
        var eventLabel = ToDisplayText(eventType);
        var bannerImage = ResolveHeroImageSource(theme, serviceLabel, eventLabel, sourceService);

        return $$"""
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{HtmlEncode(headline)}}</title>
    <style>
        body { margin: 0; padding: 0; background: #eef4fb; font-family: Segoe UI, Arial, Helvetica, sans-serif; color: #0f172a; }
        .preheader { display:none !important; visibility:hidden; mso-hide:all; opacity:0; color:transparent; height:0; width:0; overflow:hidden; }
        .wrapper { width: 100%; background: radial-gradient(circle at 10% 10%, {{theme.WrapperStart}} 0%, {{theme.WrapperMid}} 45%, {{theme.WrapperEnd}} 100%); padding: 28px 12px; }
        .card { max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12); }
        .hero-wrap { background: linear-gradient(135deg, {{theme.AccentStart}}, {{theme.AccentEnd}}); padding: 16px 16px 10px 16px; animation: floatCard 6s ease-in-out infinite; }
        .hero-image { width: 100%; border-radius: 14px; display: block; border: 0; }
        .content { padding: 26px 28px; }
        .badge { display: inline-block; background: {{theme.BadgeBackground}}; color: {{theme.BadgeText}}; border: 1px solid {{theme.BadgeBorder}}; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: .3px; text-transform: uppercase; }
        h1 { margin: 14px 0 10px; font-size: 27px; line-height: 1.25; color: #0f172a; }
        p { margin: 0 0 12px; font-size: 15px; line-height: 1.7; color: #1e293b; }
        .lead { font-size: 17px; color: {{theme.LeadColor}}; font-weight: 600; }
        .muted { color: #475569; font-size: 14px; }
        .otp-box { margin: 14px 0; padding: 14px 16px; text-align: center; border-radius: 12px; background: #f0f9ff; border: 1px dashed {{theme.AccentStart}}; color: #0c4a6e; font-size: 26px; font-weight: 800; letter-spacing: 4px; }
        .detail-table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 18px 0 8px; border: 1px solid #dbeafe; border-radius: 12px; overflow: hidden; }
        .detail-table td { padding: 11px 12px; font-size: 14px; border-bottom: 1px solid #e2e8f0; }
        .detail-table tr:last-child td { border-bottom: 0; }
        .detail-key { width: 35%; color: {{theme.DetailKeyColor}}; font-weight: 700; background: #f8fbff; }
        .detail-value { color: #0f172a; }
        .digest-list { margin: 14px 0 6px; }
        .digest-item { margin-bottom: 10px; padding: 12px 12px 11px; border-left: 4px solid {{theme.AccentStart}}; border-radius: 10px; background: #f8fafc; }
        .digest-title { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 3px; }
        .digest-meta { font-size: 12px; color: #475569; margin-bottom: 5px; }
        .digest-preview { font-size: 13px; color: #334155; line-height: 1.55; }
        .footer { padding: 16px 28px 24px; font-size: 12px; line-height: 1.6; color: #64748b; background: #f8fafc; }
        @keyframes floatCard {
            0% { transform: translateY(0px); }
            50% { transform: translateY(-4px); }
            100% { transform: translateY(0px); }
        }
        @media (prefers-reduced-motion: reduce) {
            .hero-wrap { animation: none !important; }
        }
        @media only screen and (max-width: 640px) {
            .content { padding: 20px 18px; }
            .footer { padding: 14px 18px 18px; }
            h1 { font-size: 22px; }
            .otp-box { font-size: 22px; letter-spacing: 2px; }
            .detail-key { width: 40%; }
        }
    </style>
</head>
<body>
    <div class="preheader">{{HtmlEncode(preheader)}}</div>
    <div class="wrapper">
        <div class="card" role="article" aria-label="Supply Chain Platform email notification">
            <div class="hero-wrap">
                <img class="hero-image" src="{{bannerImage}}" alt="Supply Chain Platform update banner" />
            </div>
            <div class="content">
                <span class="badge">{{HtmlEncode(badge)}}</span>
                <h1>{{HtmlEncode(headline)}}</h1>
                {{bodyHtml}}
                <table class="detail-table" role="presentation" aria-label="Notification details">
                    {{detailsHtml}}
                </table>
            </div>
            <div class="footer">
                Supply Chain Platform Team<br>
                This is an automated email for account and workflow updates.
            </div>
        </div>
    </div>
</body>
</html>
""";
    }

    private static string ResolveHeroImageSource(
        EmailTheme theme,
        string serviceLabel,
        string eventLabel,
        string sourceService)
    {
        if (EnterpriseAiHeroImageUrls.TryGetValue(sourceService, out var heroImageUrl)
            && !string.IsNullOrWhiteSpace(heroImageUrl))
        {
            return heroImageUrl;
        }

        if (EnterpriseAiHeroImageUrls.TryGetValue("default", out var defaultHeroImageUrl)
            && !string.IsNullOrWhiteSpace(defaultHeroImageUrl))
        {
            return defaultHeroImageUrl;
        }

        return BuildInlineHeroSvgDataUri(theme, serviceLabel, eventLabel, sourceService);
    }

    private static EmailTheme ResolveTheme(string sourceService)
    {
        return sourceService.Trim().ToLowerInvariant() switch
        {
            "identity" => new EmailTheme(
                WrapperStart: "#dbeafe",
                WrapperMid: "#eef4ff",
                WrapperEnd: "#f8fbff",
                AccentStart: "#0ea5e9",
                AccentEnd: "#2563eb",
                BadgeBackground: "#eff6ff",
                BadgeText: "#1d4ed8",
                BadgeBorder: "#93c5fd",
                LeadColor: "#1e40af",
                DetailKeyColor: "#1d4ed8",
                HeroTitle: "Identity and Access",
                HeroSubtitle: "Security and account activity"),

            "order" => new EmailTheme(
                WrapperStart: "#e0e7ff",
                WrapperMid: "#eef2ff",
                WrapperEnd: "#f8faff",
                AccentStart: "#6366f1",
                AccentEnd: "#4338ca",
                BadgeBackground: "#eef2ff",
                BadgeText: "#4338ca",
                BadgeBorder: "#a5b4fc",
                LeadColor: "#3730a3",
                DetailKeyColor: "#4338ca",
                HeroTitle: "Order Workflow",
                HeroSubtitle: "Approvals, statuses, and fulfillment"),

            "payment" => new EmailTheme(
                WrapperStart: "#dcfce7",
                WrapperMid: "#ecfdf5",
                WrapperEnd: "#f8fffb",
                AccentStart: "#10b981",
                AccentEnd: "#059669",
                BadgeBackground: "#ecfdf5",
                BadgeText: "#047857",
                BadgeBorder: "#86efac",
                LeadColor: "#065f46",
                DetailKeyColor: "#047857",
                HeroTitle: "Payment and Invoices",
                HeroSubtitle: "Credits, invoices, and settlements"),

            "logistics" => new EmailTheme(
                WrapperStart: "#ffedd5",
                WrapperMid: "#fff7ed",
                WrapperEnd: "#fffaf5",
                AccentStart: "#f59e0b",
                AccentEnd: "#ea580c",
                BadgeBackground: "#fff7ed",
                BadgeText: "#c2410c",
                BadgeBorder: "#fdba74",
                LeadColor: "#9a3412",
                DetailKeyColor: "#c2410c",
                HeroTitle: "Logistics Timeline",
                HeroSubtitle: "Shipments, assignments, and tracking"),

            "digest" => new EmailTheme(
                WrapperStart: "#cffafe",
                WrapperMid: "#ecfeff",
                WrapperEnd: "#f6fdff",
                AccentStart: "#06b6d4",
                AccentEnd: "#0f766e",
                BadgeBackground: "#ecfeff",
                BadgeText: "#0f766e",
                BadgeBorder: "#67e8f9",
                LeadColor: "#155e75",
                DetailKeyColor: "#0f766e",
                HeroTitle: "Unified Workflow Digest",
                HeroSubtitle: "Multiple updates in one clear summary"),

            _ => new EmailTheme(
                WrapperStart: "#d9f5f3",
                WrapperMid: "#eef4fb",
                WrapperEnd: "#f7fbff",
                AccentStart: "#0ea5e9",
                AccentEnd: "#14b8a6",
                BadgeBackground: "#ecfeff",
                BadgeText: "#0f766e",
                BadgeBorder: "#5eead4",
                LeadColor: "#0b4a6f",
                DetailKeyColor: "#1d4ed8",
                HeroTitle: "Supply Chain Update",
                HeroSubtitle: "Actionable platform notification")
        };
    }

    private static string BuildDetailsRowsHtml(IReadOnlyList<(string Label, string Value)> details)
    {
        if (details.Count == 0)
        {
            return "<tr><td class=\"detail-key\">Details</td><td class=\"detail-value\">No additional details provided.</td></tr>";
        }

        var builder = new StringBuilder();
        foreach (var (label, value) in details)
        {
            builder.Append("<tr><td class=\"detail-key\">");
            builder.Append(HtmlEncode(label));
            builder.Append("</td><td class=\"detail-value\">");
            builder.Append(HtmlEncode(value));
            builder.Append("</td></tr>");
        }

        return builder.ToString();
    }

    private static string BuildInlineHeroSvgDataUri(
        EmailTheme theme,
        string serviceLabel,
        string eventLabel,
        string sourceService)
    {
        var safeServiceLabel = HtmlEncode(serviceLabel);
        var safeEventLabel = HtmlEncode(eventLabel);
        var safeHeroTitle = HtmlEncode(theme.HeroTitle);
        var safeHeroSubtitle = HtmlEncode(theme.HeroSubtitle);
        var illustration = BuildServiceIllustration(sourceService);

        var svg = $$"""
<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='320' viewBox='0 0 1200 320'>
    <defs>
        <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'>
            <stop offset='0%' stop-color='{{theme.AccentStart}}'/>
            <stop offset='100%' stop-color='{{theme.AccentEnd}}'/>
        </linearGradient>
    </defs>
    <rect width='1200' height='320' fill='url(#bg)'/>
    <circle cx='1030' cy='86' r='70' fill='rgba(255,255,255,0.25)'/>
    <circle cx='1110' cy='205' r='44' fill='rgba(255,255,255,0.22)'/>
    {{illustration}}
    <text x='72' y='146' font-family='Segoe UI, Arial, sans-serif' font-size='29' fill='white' opacity='0.9'>Supply Chain Platform</text>
    <text x='72' y='194' font-family='Segoe UI, Arial, sans-serif' font-size='49' font-weight='700' fill='white'>{{safeHeroTitle}}</text>
    <text x='72' y='232' font-family='Segoe UI, Arial, sans-serif' font-size='24' fill='white' opacity='0.95'>{{safeHeroSubtitle}}</text>
    <text x='72' y='270' font-family='Segoe UI, Arial, sans-serif' font-size='22' fill='white' opacity='0.9'>{{safeServiceLabel}} - {{safeEventLabel}}</text>
</svg>
""";

        return "data:image/svg+xml;utf8," + Uri.EscapeDataString(svg);
    }

    private static string BuildServiceIllustration(string sourceService)
    {
        return sourceService.Trim().ToLowerInvariant() switch
        {
            "order" => "<rect x='885' y='132' width='248' height='118' rx='16' fill='rgba(255,255,255,0.18)'/>"
                     + "<rect x='910' y='158' width='160' height='16' rx='8' fill='rgba(255,255,255,0.55)'/>"
                     + "<rect x='910' y='186' width='198' height='12' rx='6' fill='rgba(255,255,255,0.45)'/>"
                     + "<rect x='910' y='210' width='130' height='12' rx='6' fill='rgba(255,255,255,0.38)'/>",

            "payment" => "<rect x='890' y='130' width='240' height='120' rx='20' fill='rgba(255,255,255,0.16)'/>"
                       + "<rect x='920' y='168' width='48' height='56' rx='8' fill='rgba(255,255,255,0.52)'/>"
                       + "<rect x='979' y='150' width='48' height='74' rx='8' fill='rgba(255,255,255,0.46)'/>"
                       + "<rect x='1038' y='182' width='48' height='42' rx='8' fill='rgba(255,255,255,0.40)'/>",

            "logistics" => "<rect x='888' y='162' width='200' height='56' rx='14' fill='rgba(255,255,255,0.2)'/>"
                         + "<rect x='1088' y='178' width='44' height='40' rx='10' fill='rgba(255,255,255,0.22)'/>"
                         + "<circle cx='938' cy='230' r='13' fill='rgba(255,255,255,0.65)'/>"
                         + "<circle cx='1098' cy='230' r='13' fill='rgba(255,255,255,0.65)'/>"
                         + "<line x1='880' y1='244' x2='1138' y2='244' stroke='rgba(255,255,255,0.38)' stroke-width='6' stroke-linecap='round'/>",

            "identity" => "<path d='M1012 114 l86 30 v62 c0 46 -35 86 -86 100 c-51 -14 -86 -54 -86 -100 v-62 z' fill='rgba(255,255,255,0.2)'/>"
                        + "<path d='M1012 145 l48 18 v36 c0 26 -18 47 -48 57 c-30 -10 -48 -31 -48 -57 v-36 z' fill='rgba(255,255,255,0.45)'/>",

            "digest" => "<rect x='878' y='128' width='232' height='44' rx='10' fill='rgba(255,255,255,0.2)'/>"
                      + "<rect x='895' y='139' width='198' height='9' rx='5' fill='rgba(255,255,255,0.58)'/>"
                      + "<rect x='895' y='154' width='168' height='8' rx='4' fill='rgba(255,255,255,0.42)'/>"
                      + "<rect x='878' y='183' width='232' height='44' rx='10' fill='rgba(255,255,255,0.2)'/>"
                      + "<rect x='895' y='194' width='172' height='9' rx='5' fill='rgba(255,255,255,0.58)'/>"
                      + "<rect x='895' y='209' width='208' height='8' rx='4' fill='rgba(255,255,255,0.42)'/>",

            _ => "<circle cx='998' cy='188' r='56' fill='rgba(255,255,255,0.22)'/>"
               + "<circle cx='1062' cy='188' r='40' fill='rgba(255,255,255,0.28)'/>"
        };
    }

    private static string HtmlEncode(string value)
    {
        return WebUtility.HtmlEncode(value ?? string.Empty);
    }

    private static string ToDisplayText(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var withSeparators = value.Replace("_", " ").Replace("-", " ");
        var splitCamelCase = Regex.Replace(withSeparators, "([a-z0-9])([A-Z])", "$1 $2");
        var splitAcronyms = Regex.Replace(splitCamelCase, "([A-Z]+)([A-Z][a-z])", "$1 $2");
        var normalized = new string(splitAcronyms.Select(ch => char.IsLetterOrDigit(ch) ? ch : ' ').ToArray());

        var textInfo = CultureInfo.InvariantCulture.TextInfo;
        var tokens = normalized
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(token =>
                token.Length <= 4 && token.All(char.IsUpper)
                    ? token
                    : textInfo.ToTitleCase(token.ToLowerInvariant()));

        return string.Join(" ", tokens);
    }
}
