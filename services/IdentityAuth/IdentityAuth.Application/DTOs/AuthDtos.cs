namespace IdentityAuth.Application.DTOs;

public sealed record RegisterDealerRequest(
    string Email,
    string Password,
    string FullName,
    string PhoneNumber,
    string BusinessName,
    string GstNumber,
    string TradeLicenseNo,
    string Address,
    string City,
    string State,
    string PinCode,
    bool IsInterstate);

public sealed record RegisterDealerResponse(Guid UserId, string Status, string Message);

public sealed record LoginRequest(string Email, string Password);

public sealed record AuthResponse(
    Guid UserId,
    string Email,
    string Role,
    string AccessToken,
    DateTime AccessTokenExpiresAtUtc,
    string RefreshToken,
    DateTime RefreshTokenExpiresAtUtc,
    bool MustChangePassword);

public sealed record CreateAgentRequest(
    string Email,
    string TemporaryPassword,
    string FullName,
    string PhoneNumber);

public sealed record CreateAgentResponse(
    Guid UserId,
    string Email,
    string FullName,
    string Status,
    string Message);

public sealed record AgentSummaryDto(
    Guid UserId,
    string FullName,
    string Email,
    string PhoneNumber,
    string Status,
    DateTime CreatedAtUtc);

public sealed record ForgotPasswordRequest(string Email);

public sealed record ResetPasswordRequest(string Email, string OtpCode, string NewPassword);

public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public sealed record LogoutRequest(string? RefreshToken);

public sealed record RejectDealerRequest(string Reason);

public sealed record UpdateCreditLimitRequest(decimal CreditLimit);

public sealed record DealerSummaryDto(
    Guid UserId,
    string FullName,
    string Email,
    string BusinessName,
    string GstNumber,
    string Status,
    decimal CreditLimit,
    DateTime RegisteredAtUtc);

public sealed record DealerDetailDto(
    Guid UserId,
    string FullName,
    string Email,
    string PhoneNumber,
    string Status,
    decimal CreditLimit,
    string? RejectionReason,
    string BusinessName,
    string GstNumber,
    string TradeLicenseNo,
    string Address,
    string City,
    string State,
    string PinCode,
    bool IsInterstate,
    DateTime RegisteredAtUtc);

public sealed record UserProfileDto(
    Guid UserId,
    string FullName,
    string Email,
    string Role,
    string Status,
    decimal CreditLimit,
    string? DealerBusinessName,
    string? DealerGstNumber,
    bool? IsInterstate);

public sealed record InternalUserContactDto(
    Guid UserId,
    string FullName,
    string Email,
    string Role,
    string Status);

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int TotalCount, int Page, int PageSize);

public sealed record CreditLimitUpdateResult(bool Succeeded, string Message);
