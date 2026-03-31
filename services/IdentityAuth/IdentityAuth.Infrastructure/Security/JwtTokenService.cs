using IdentityAuth.Application.Abstractions;
using IdentityAuth.Domain.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace IdentityAuth.Infrastructure.Security;

internal sealed class JwtTokenService(IConfiguration configuration) : ITokenService
{
    private readonly string _secretKey = configuration["Jwt:SecretKey"]
        ?? throw new InvalidOperationException("Jwt:SecretKey is missing.");

    private readonly string _issuer = configuration["Jwt:Issuer"] ?? "SupplyChainPlatform";
    private readonly string _audience = configuration["Jwt:Audience"] ?? "SupplyChainPlatform.Client";
    private readonly int _accessTokenMinutes = configuration.GetValue<int?>("Jwt:AccessTokenMinutes") ?? 15;
    private readonly int _refreshTokenDays = configuration.GetValue<int?>("Jwt:RefreshTokenDays") ?? 7;

    public AccessTokenEnvelope GenerateAccessToken(User user)
    {
        var now = DateTime.UtcNow;
        var expiresAtUtc = now.AddMinutes(_accessTokenMinutes);
        var jti = Guid.NewGuid().ToString("N");

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.UserId.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(JwtRegisteredClaimNames.Jti, jti),
            new(ClaimTypes.Role, user.Role.ToString())
        };

        if (user.DealerProfile is not null)
        {
            claims.Add(new Claim("dealer_id", user.UserId.ToString()));
        }

        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secretKey));
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            notBefore: now,
            expires: expiresAtUtc,
            signingCredentials: credentials);

        var serializedToken = new JwtSecurityTokenHandler().WriteToken(token);

        return new AccessTokenEnvelope(serializedToken, expiresAtUtc, jti);
    }

    public RefreshTokenEnvelope GenerateRefreshToken()
    {
        Span<byte> randomBytes = stackalloc byte[64];
        RandomNumberGenerator.Fill(randomBytes);

        var refreshToken = Convert.ToBase64String(randomBytes);
        var refreshHash = HashToken(refreshToken);
        var expiresAtUtc = DateTime.UtcNow.AddDays(_refreshTokenDays);

        return new RefreshTokenEnvelope(refreshToken, refreshHash, expiresAtUtc);
    }

    public string HashToken(string token)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes);
    }
}
