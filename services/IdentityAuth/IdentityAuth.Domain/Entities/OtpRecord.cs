namespace IdentityAuth.Domain.Entities;

public sealed class OtpRecord
{
    private OtpRecord()
    {
    }

    public Guid OtpRecordId { get; private set; } = Guid.NewGuid();
    public Guid UserId { get; private set; }
    public string OtpHash { get; private set; } = string.Empty;
    public DateTime CreatedAtUtc { get; private set; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; private set; }
    public bool IsUsed { get; private set; }
    public DateTime? UsedAtUtc { get; private set; }

    public static OtpRecord Create(Guid userId, string otpHash, DateTime expiresAtUtc)
    {
        return new OtpRecord
        {
            UserId = userId,
            OtpHash = otpHash,
            ExpiresAtUtc = expiresAtUtc
        };
    }

    public void MarkUsed()
    {
        if (IsUsed)
        {
            return;
        }

        IsUsed = true;
        UsedAtUtc = DateTime.UtcNow;
    }
}
