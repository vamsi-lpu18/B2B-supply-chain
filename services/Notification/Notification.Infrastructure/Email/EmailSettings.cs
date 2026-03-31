namespace Notification.Infrastructure.Email;

internal sealed class EmailSettings
{
    public bool Enabled { get; set; }
    public string FromAddress { get; set; } = "no-reply@supplychain.local";
    public string FromName { get; set; } = "Supply Chain Platform";
    public string SmtpHost { get; set; } = "localhost";
    public int SmtpPort { get; set; } = 25;
    public bool UseSsl { get; set; }
    public string? Username { get; set; }
    public string? Password { get; set; }
}
