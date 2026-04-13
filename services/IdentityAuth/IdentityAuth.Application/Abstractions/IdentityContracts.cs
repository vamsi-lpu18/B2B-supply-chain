using IdentityAuth.Application.DTOs;
using IdentityAuth.Domain.Entities;

namespace IdentityAuth.Application.Abstractions;

public interface IIdentityAuthService
{
    Task<RegisterDealerResponse> RegisterDealerAsync(RegisterDealerRequest request, CancellationToken cancellationToken);
    Task<CreateAgentResponse> CreateAgentAsync(CreateAgentRequest request, CancellationToken cancellationToken);
    Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken cancellationToken);
    Task<AuthResponse> RefreshTokenAsync(string refreshToken, CancellationToken cancellationToken);
    Task ForgotPasswordAsync(ForgotPasswordRequest request, CancellationToken cancellationToken);
    Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken cancellationToken);
    Task ChangePasswordAsync(Guid userId, ChangePasswordRequest request, CancellationToken cancellationToken);
    Task LogoutAsync(Guid userId, string? jti, DateTime? tokenExpiresAtUtc, string? refreshToken, CancellationToken cancellationToken);
    Task<PagedResult<AgentSummaryDto>> GetAgentsAsync(int page, int pageSize, string? search, CancellationToken cancellationToken);
    Task<PagedResult<DealerSummaryDto>> GetDealersAsync(int page, int pageSize, string? search, CancellationToken cancellationToken);
    Task<DealerDetailDto?> GetDealerAsync(Guid dealerId, CancellationToken cancellationToken);
    Task<bool> ApproveDealerAsync(Guid dealerId, CancellationToken cancellationToken);
    Task<bool> RejectDealerAsync(Guid dealerId, string reason, CancellationToken cancellationToken);
    Task<CreditLimitUpdateResult> UpdateCreditLimitAsync(Guid dealerId, decimal creditLimit, CancellationToken cancellationToken);
    Task<UserProfileDto?> GetProfileAsync(Guid userId, CancellationToken cancellationToken);
    Task<InternalUserContactDto?> GetInternalUserContactAsync(Guid userId, CancellationToken cancellationToken);
}

public interface IUserRepository
{
    Task AddUserAsync(User user, CancellationToken cancellationToken);
    Task<User?> GetByEmailAsync(string email, CancellationToken cancellationToken);
    Task<User?> GetByIdAsync(Guid userId, CancellationToken cancellationToken);
    Task<bool> EmailExistsAsync(string email, CancellationToken cancellationToken);
    Task<bool> GstExistsAsync(string gstNumber, CancellationToken cancellationToken);
    Task<(IReadOnlyList<User> Items, int TotalCount)> GetAgentsAsync(int page, int pageSize, string? search, CancellationToken cancellationToken);
    Task<(IReadOnlyList<User> Items, int TotalCount)> GetDealersAsync(int page, int pageSize, string? search, CancellationToken cancellationToken);
    Task AddRefreshTokenAsync(RefreshToken refreshToken, CancellationToken cancellationToken);
    Task<RefreshToken?> GetValidRefreshTokenAsync(string tokenHash, CancellationToken cancellationToken);
    Task<RefreshToken?> GetRefreshTokenAsync(string tokenHash, CancellationToken cancellationToken);
    Task AddOtpRecordAsync(OtpRecord otpRecord, CancellationToken cancellationToken);
    Task<OtpRecord?> GetValidOtpAsync(Guid userId, string otpHash, CancellationToken cancellationToken);
    Task AddOutboxMessageAsync(string eventType, object payload, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}

public interface ITokenService
{
    AccessTokenEnvelope GenerateAccessToken(User user);
    RefreshTokenEnvelope GenerateRefreshToken();
    string HashToken(string token);
}

public sealed record AccessTokenEnvelope(string Token, DateTime ExpiresAtUtc, string Jti);

public sealed record RefreshTokenEnvelope(string Token, string TokenHash, DateTime ExpiresAtUtc);

public interface IPasswordService
{
    string HashPassword(string password);
    bool VerifyPassword(string passwordHash, string password);
}

public interface IOtpService
{
    string GenerateOtpCode();
    string HashOtp(string otpCode);
}

public interface ITokenRevocationStore
{
    Task RevokeAsync(string jti, DateTime expiresAtUtc, CancellationToken cancellationToken);
    Task<bool> IsRevokedAsync(string jti, CancellationToken cancellationToken);
}

public interface ICreditLimitGateway
{
    Task<bool> UpdateCreditLimitAsync(Guid dealerId, decimal creditLimit, CancellationToken cancellationToken);
}

public interface INotificationGateway
{
    Task<bool> SendPasswordResetOtpAsync(
        Guid userId,
        string email,
        string otpCode,
        DateTime expiresAtUtc,
        CancellationToken cancellationToken);
}
