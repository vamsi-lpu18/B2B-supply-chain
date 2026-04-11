using IdentityAuth.Domain.Entities;
using IdentityAuth.Domain.Enums;

namespace IdentityAuth.Domain.Tests;

public sealed class UserTests
{
    [Fact]
    public void CreateDealer_SetsDealerRolePendingStatusAndProfile()
    {
        var user = User.CreateDealer(
            "dealer@example.com",
            "hash",
            "Demo Dealer",
            "9000000000",
            "Demo Traders",
            "37ABCDE1234F1Z5",
            "TL-100",
            "12 Market Street",
            "Hyderabad",
            "Telangana",
            "500001",
            isInterstate: true);

        Assert.Equal(UserRole.Dealer, user.Role);
        Assert.Equal(UserStatus.Pending, user.Status);
        Assert.Equal("dealer@example.com", user.Email);
        Assert.NotNull(user.DealerProfile);
        Assert.Equal("DEMO TRADERS", user.DealerProfile!.BusinessName.ToUpperInvariant());
    }

    [Fact]
    public void ApproveDealer_ActivatesUserAndClearsRejectionReason()
    {
        var user = CreateDealer();
        user.RejectDealer("missing docs");

        user.ApproveDealer();

        Assert.Equal(UserStatus.Active, user.Status);
        Assert.Null(user.RejectionReason);
    }

    [Fact]
    public void RejectDealer_SetsRejectedStatusAndTrimmedReason()
    {
        var user = CreateDealer();

        user.RejectDealer("  invalid GST details  ");

        Assert.Equal(UserStatus.Rejected, user.Status);
        Assert.Equal("invalid GST details", user.RejectionReason);
    }

    [Fact]
    public void UpdateCreditLimit_StoresNewValue()
    {
        var user = CreateDealer();

        user.UpdateCreditLimit(750000m);

        Assert.Equal(750000m, user.CreditLimit);
    }

    private static User CreateDealer()
    {
        return User.CreateDealer(
            "dealer@example.com",
            "hash",
            "Demo Dealer",
            "9000000000",
            "Demo Traders",
            "37ABCDE1234F1Z5",
            "TL-100",
            "12 Market Street",
            "Hyderabad",
            "Telangana",
            "500001",
            isInterstate: true);
    }
}
