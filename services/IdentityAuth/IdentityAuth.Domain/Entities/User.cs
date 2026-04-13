using IdentityAuth.Domain.Enums;
using IdentityAuth.Domain.ValueObjects;

namespace IdentityAuth.Domain.Entities;

public sealed class User
{
    private const string PasswordChangeRequiredMarker = "__PASSWORD_CHANGE_REQUIRED__";

    private User()
    {
    }

    public Guid UserId { get; private set; } = Guid.NewGuid();
    public string Email { get; private set; } = string.Empty;
    public string PasswordHash { get; private set; } = string.Empty;
    public string FullName { get; private set; } = string.Empty;
    public string PhoneNumber { get; private set; } = string.Empty;
    public UserRole Role { get; private set; }
    public UserStatus Status { get; private set; }
    public decimal CreditLimit { get; private set; } = 500000m;
    public string? RejectionReason { get; private set; }
    public DateTime CreatedAtUtc { get; private set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; private set; } = DateTime.UtcNow;

    public DealerProfile? DealerProfile { get; private set; }
    public ICollection<RefreshToken> RefreshTokens { get; private set; } = new List<RefreshToken>();
    public ICollection<OtpRecord> OtpRecords { get; private set; } = new List<OtpRecord>();

    public static User CreateDealer(
        string email,
        string passwordHash,
        string fullName,
        string phoneNumber,
        string businessName,
        string gstNumber,
        string tradeLicenseNo,
        string address,
        string city,
        string state,
        string pinCode,
        bool isInterstate)
    {
        var user = new User
        {
            Email = email.Trim().ToLowerInvariant(),
            PasswordHash = passwordHash,
            FullName = fullName.Trim(),
            PhoneNumber = phoneNumber.Trim(),
            Role = UserRole.Dealer,
            Status = UserStatus.Pending,
            UpdatedAtUtc = DateTime.UtcNow
        };

        user.DealerProfile = DealerProfile.Create(
            user.UserId,
            businessName,
            gstNumber,
            tradeLicenseNo,
            address,
            city,
            state,
            pinCode,
            isInterstate);

        return user;
    }

    public static User CreateStaff(
        string email,
        string passwordHash,
        string fullName,
        string phoneNumber,
        UserRole role)
    {
        return new User
        {
            Email = email.Trim().ToLowerInvariant(),
            PasswordHash = passwordHash,
            FullName = fullName.Trim(),
            PhoneNumber = phoneNumber.Trim(),
            Role = role,
            Status = UserStatus.Active,
            UpdatedAtUtc = DateTime.UtcNow
        };
    }

    public void ApproveDealer()
    {
        Status = UserStatus.Active;
        RejectionReason = null;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void RejectDealer(string reason)
    {
        Status = UserStatus.Rejected;
        RejectionReason = reason.Trim();
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void UpdatePassword(string passwordHash)
    {
        PasswordHash = passwordHash;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void UpdateCreditLimit(decimal creditLimit)
    {
        CreditLimit = creditLimit;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void RequirePasswordChange()
    {
        RejectionReason = PasswordChangeRequiredMarker;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void ClearPasswordChangeRequirement()
    {
        if (RejectionReason == PasswordChangeRequiredMarker)
        {
            RejectionReason = null;
            UpdatedAtUtc = DateTime.UtcNow;
        }
    }

    public bool IsPasswordChangeRequired()
    {
        return RejectionReason == PasswordChangeRequiredMarker;
    }
}
