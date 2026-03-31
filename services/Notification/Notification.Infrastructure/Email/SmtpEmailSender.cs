using Microsoft.Extensions.Options;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using System.Net;
using System.Text.RegularExpressions;

namespace Notification.Infrastructure.Email;

internal sealed class SmtpEmailSender(IOptions<EmailSettings> settings)
{
    public async Task SendAsync(string recipientEmail, string subject, string body)
    {
        var config = settings.Value;

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(config.FromName, config.FromAddress));
        message.To.Add(MailboxAddress.Parse(recipientEmail));
        message.Subject = subject;

        var bodyBuilder = new BodyBuilder
        {
            HtmlBody = body,
            TextBody = BuildTextFallback(body)
        };

        message.Body = bodyBuilder.ToMessageBody();

        var secureSocketOptions = ResolveSocketOptions(config);

        using var client = new SmtpClient();
        await client.ConnectAsync(config.SmtpHost, config.SmtpPort, secureSocketOptions);

        if (!string.IsNullOrWhiteSpace(config.Username))
        {
            await client.AuthenticateAsync(config.Username, config.Password ?? string.Empty);
        }

        await client.SendAsync(message);
        await client.DisconnectAsync(true);
    }

    private static string BuildTextFallback(string html)
    {
        if (string.IsNullOrWhiteSpace(html))
        {
            return string.Empty;
        }

        var withoutScripts = Regex.Replace(html, "<script[^>]*>.*?</script>", string.Empty, RegexOptions.IgnoreCase | RegexOptions.Singleline);
        var withoutStyles = Regex.Replace(withoutScripts, "<style[^>]*>.*?</style>", string.Empty, RegexOptions.IgnoreCase | RegexOptions.Singleline);
        var text = Regex.Replace(withoutStyles, "<[^>]+>", " ");
        text = WebUtility.HtmlDecode(text);
        text = Regex.Replace(text, "\\s{2,}", " ").Trim();

        return text;
    }

    private static SecureSocketOptions ResolveSocketOptions(EmailSettings settings)
    {
        if (!settings.UseSsl)
        {
            return SecureSocketOptions.None;
        }

        if (settings.SmtpPort == 465)
        {
            return SecureSocketOptions.SslOnConnect;
        }

        return SecureSocketOptions.StartTls;
    }
}
