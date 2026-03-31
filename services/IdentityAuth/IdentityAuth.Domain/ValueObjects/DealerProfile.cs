namespace IdentityAuth.Domain.ValueObjects;

public sealed class DealerProfile
{
    private DealerProfile()
    {
    }

    public Guid DealerProfileId { get; private set; } = Guid.NewGuid();
    public Guid UserId { get; private set; }
    public string BusinessName { get; private set; } = string.Empty;
    public string GstNumber { get; private set; } = string.Empty;
    public string TradeLicenseNo { get; private set; } = string.Empty;
    public string Address { get; private set; } = string.Empty;
    public string City { get; private set; } = string.Empty;
    public string State { get; private set; } = string.Empty;
    public string PinCode { get; private set; } = string.Empty;
    public bool IsInterstate { get; private set; }

    public static DealerProfile Create(
        Guid userId,
        string businessName,
        string gstNumber,
        string tradeLicenseNo,
        string address,
        string city,
        string state,
        string pinCode,
        bool isInterstate)
    {
        return new DealerProfile
        {
            UserId = userId,
            BusinessName = businessName.Trim(),
            GstNumber = gstNumber.Trim().ToUpperInvariant(),
            TradeLicenseNo = tradeLicenseNo.Trim(),
            Address = address.Trim(),
            City = city.Trim(),
            State = state.Trim(),
            PinCode = pinCode.Trim(),
            IsInterstate = isInterstate
        };
    }
}
