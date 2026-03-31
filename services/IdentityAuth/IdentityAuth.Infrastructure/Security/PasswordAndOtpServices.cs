using IdentityAuth.Application.Abstractions;
using Microsoft.AspNetCore.Identity;
using System.Security.Cryptography;
using System.Text;

namespace IdentityAuth.Infrastructure.Security;

internal sealed class PasswordService : IPasswordService
{
    private readonly PasswordHasher<string> _passwordHasher = new();

    public string HashPassword(string password)
    {
        return _passwordHasher.HashPassword("identity-auth", password);
    }

    public bool VerifyPassword(string passwordHash, string password)
    {
        var result = _passwordHasher.VerifyHashedPassword("identity-auth", passwordHash, password);
        return result != PasswordVerificationResult.Failed;
    }
}

internal sealed class OtpService : IOtpService
{
    public string GenerateOtpCode()
    {
        var value = RandomNumberGenerator.GetInt32(0, 1000000);
        return value.ToString("D6");
    }

    public string HashOtp(string otpCode)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(otpCode));
        return Convert.ToHexString(bytes);
    }
}
