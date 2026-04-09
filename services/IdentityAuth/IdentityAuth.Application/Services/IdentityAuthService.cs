using FluentValidation;
using IdentityAuth.Application.Abstractions;
using IdentityAuth.Application.DTOs;
using IdentityAuth.Application.Exceptions;
using IdentityAuth.Domain.Entities;
using IdentityAuth.Domain.Enums;

namespace IdentityAuth.Application.Services;

public sealed class IdentityAuthService(
    IUserRepository userRepository,
    ITokenService tokenService,
    IPasswordService passwordService,
    IOtpService otpService,
    ITokenRevocationStore tokenRevocationStore,
    ICreditLimitGateway creditLimitGateway,
    INotificationGateway notificationGateway,
    IValidator<RegisterDealerRequest> registerDealerValidator,
    IValidator<LoginRequest> loginValidator,
    IValidator<ResetPasswordRequest> resetPasswordValidator,
    IValidator<RejectDealerRequest> rejectDealerValidator,
    IValidator<UpdateCreditLimitRequest> updateCreditLimitValidator)
    : IIdentityAuthService
{
    public async Task<RegisterDealerResponse> RegisterDealerAsync(RegisterDealerRequest request, CancellationToken cancellationToken)
    {
        await registerDealerValidator.ValidateAndThrowAsync(request, cancellationToken);

        if (await userRepository.EmailExistsAsync(request.Email, cancellationToken))
        {
            throw new DomainValidationException("Email is already registered.");
        }

        if (await userRepository.GstExistsAsync(request.GstNumber, cancellationToken))
        {
            throw new DomainValidationException("GST number is already registered.");
        }

        var passwordHash = passwordService.HashPassword(request.Password);
        var user = User.CreateDealer(
            request.Email,
            passwordHash,
            request.FullName,
            request.PhoneNumber,
            request.BusinessName,
            request.GstNumber,
            request.TradeLicenseNo,
            request.Address,
            request.City,
            request.State,
            request.PinCode,
            request.IsInterstate);

        await userRepository.AddUserAsync(user, cancellationToken);
        await userRepository.AddOutboxMessageAsync("DealerRegistered", new
        {
            user.UserId,
            user.Email,
            user.FullName,
            request.BusinessName,
            request.GstNumber,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        await userRepository.SaveChangesAsync(cancellationToken);

        return new RegisterDealerResponse(user.UserId, user.Status.ToString(), "Registration submitted and pending admin approval.");
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken cancellationToken)
    {
        await loginValidator.ValidateAndThrowAsync(request, cancellationToken);

        var user = await userRepository.GetByEmailAsync(request.Email, cancellationToken)
            ?? throw new UnauthorizedAccessException("Invalid credentials.");

        if (!passwordService.VerifyPassword(user.PasswordHash, request.Password))
        {
            throw new UnauthorizedAccessException("Invalid credentials.");
        }

        if (user.Status != UserStatus.Active)
        {
            throw new DomainValidationException($"User status is '{user.Status}'. Login is not allowed.");
        }

        var accessToken = tokenService.GenerateAccessToken(user);
        var refreshToken = tokenService.GenerateRefreshToken();

        await userRepository.AddRefreshTokenAsync(
            RefreshToken.Create(user.UserId, refreshToken.TokenHash, refreshToken.ExpiresAtUtc),
            cancellationToken);

        await userRepository.SaveChangesAsync(cancellationToken);

        return BuildAuthResponse(user, accessToken, refreshToken);
    }

    public async Task<AuthResponse> RefreshTokenAsync(string refreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            throw new UnauthorizedAccessException("Refresh token is missing.");
        }

        var refreshHash = tokenService.HashToken(refreshToken);
        var storedToken = await userRepository.GetValidRefreshTokenAsync(refreshHash, cancellationToken)
            ?? throw new UnauthorizedAccessException("Refresh token is invalid or expired.");

        var user = await userRepository.GetByIdAsync(storedToken.UserId, cancellationToken)
            ?? throw new UnauthorizedAccessException("User not found for refresh token.");

        storedToken.Revoke();

        var accessToken = tokenService.GenerateAccessToken(user);
        var newRefreshToken = tokenService.GenerateRefreshToken();

        await userRepository.AddRefreshTokenAsync(
            RefreshToken.Create(user.UserId, newRefreshToken.TokenHash, newRefreshToken.ExpiresAtUtc),
            cancellationToken);

        await userRepository.SaveChangesAsync(cancellationToken);

        return BuildAuthResponse(user, accessToken, newRefreshToken);
    }

    public async Task ForgotPasswordAsync(ForgotPasswordRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            return;
        }

        var user = await userRepository.GetByEmailAsync(request.Email, cancellationToken);
        if (user is null)
        {
            return;
        }

        var otpCode = otpService.GenerateOtpCode();
        var otpHash = otpService.HashOtp(otpCode);
        var expiresAtUtc = DateTime.UtcNow.AddMinutes(15);
        var payload = new
        {
            user.UserId,
            user.Email,
            otpCode,
            expiresAtUtc
        };

        await userRepository.AddOtpRecordAsync(OtpRecord.Create(user.UserId, otpHash, expiresAtUtc), cancellationToken);
        await userRepository.SaveChangesAsync(cancellationToken);

        var sentDirectly = await notificationGateway.SendPasswordResetOtpAsync(
            user.UserId,
            user.Email,
            otpCode,
            expiresAtUtc,
            cancellationToken);

        if (!sentDirectly)
        {
            await userRepository.AddOutboxMessageAsync("PasswordResetRequested", payload, cancellationToken);
            await userRepository.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken cancellationToken)
    {
        await resetPasswordValidator.ValidateAndThrowAsync(request, cancellationToken);

        var user = await userRepository.GetByEmailAsync(request.Email, cancellationToken)
            ?? throw new InvalidOperationException("Invalid reset request.");

        var otpHash = otpService.HashOtp(request.OtpCode);
        var otpRecord = await userRepository.GetValidOtpAsync(user.UserId, otpHash, cancellationToken)
            ?? throw new InvalidOperationException("OTP is invalid or expired.");

        otpRecord.MarkUsed();
        user.UpdatePassword(passwordService.HashPassword(request.NewPassword));

        await userRepository.AddOutboxMessageAsync("PasswordResetCompleted", new
        {
            user.UserId,
            user.Email,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        await userRepository.SaveChangesAsync(cancellationToken);
    }

    public async Task LogoutAsync(
        Guid userId,
        string? jti,
        DateTime? tokenExpiresAtUtc,
        string? refreshToken,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(jti) && tokenExpiresAtUtc.HasValue)
        {
            await tokenRevocationStore.RevokeAsync(jti, tokenExpiresAtUtc.Value, cancellationToken);
        }

        if (!string.IsNullOrWhiteSpace(refreshToken))
        {
            var refreshHash = tokenService.HashToken(refreshToken);
            var storedToken = await userRepository.GetRefreshTokenAsync(refreshHash, cancellationToken);
            if (storedToken is not null && storedToken.UserId == userId)
            {
                storedToken.Revoke();
                await userRepository.SaveChangesAsync(cancellationToken);
            }
        }
    }

    public async Task<PagedResult<DealerSummaryDto>> GetDealersAsync(int page, int pageSize, string? search, CancellationToken cancellationToken)
    {
        page = page <= 0 ? 1 : page;
        pageSize = pageSize <= 0 ? 20 : Math.Min(pageSize, 100);

        var (items, totalCount) = await userRepository.GetDealersAsync(page, pageSize, search, cancellationToken);
        var mapped = items
            .Select(d => new DealerSummaryDto(
                d.UserId,
                d.FullName,
                d.Email,
                d.DealerProfile?.BusinessName ?? string.Empty,
                d.DealerProfile?.GstNumber ?? string.Empty,
                d.Status.ToString(),
                d.CreditLimit,
                d.CreatedAtUtc))
            .ToList();

        return new PagedResult<DealerSummaryDto>(mapped, totalCount, page, pageSize);
    }

    public async Task<DealerDetailDto?> GetDealerAsync(Guid dealerId, CancellationToken cancellationToken)
    {
        var dealer = await userRepository.GetByIdAsync(dealerId, cancellationToken);
        if (dealer is null || dealer.Role != UserRole.Dealer || dealer.DealerProfile is null)
        {
            return null;
        }

        return new DealerDetailDto(
            dealer.UserId,
            dealer.FullName,
            dealer.Email,
            dealer.PhoneNumber,
            dealer.Status.ToString(),
            dealer.CreditLimit,
            dealer.RejectionReason,
            dealer.DealerProfile.BusinessName,
            dealer.DealerProfile.GstNumber,
            dealer.DealerProfile.TradeLicenseNo,
            dealer.DealerProfile.Address,
            dealer.DealerProfile.City,
            dealer.DealerProfile.State,
            dealer.DealerProfile.PinCode,
            dealer.DealerProfile.IsInterstate,
            dealer.CreatedAtUtc);
    }

    public async Task<bool> ApproveDealerAsync(Guid dealerId, CancellationToken cancellationToken)
    {
        var dealer = await userRepository.GetByIdAsync(dealerId, cancellationToken);
        if (dealer is null || dealer.Role != UserRole.Dealer)
        {
            return false;
        }

        dealer.ApproveDealer();

        await userRepository.AddOutboxMessageAsync("DealerApproved", new
        {
            dealer.UserId,
            dealer.Email,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        await userRepository.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> RejectDealerAsync(Guid dealerId, string reason, CancellationToken cancellationToken)
    {
        await rejectDealerValidator.ValidateAndThrowAsync(new RejectDealerRequest(reason), cancellationToken);

        var dealer = await userRepository.GetByIdAsync(dealerId, cancellationToken);
        if (dealer is null || dealer.Role != UserRole.Dealer)
        {
            return false;
        }

        dealer.RejectDealer(reason);

        await userRepository.AddOutboxMessageAsync("DealerRejected", new
        {
            dealer.UserId,
            dealer.Email,
            reason,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        await userRepository.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<CreditLimitUpdateResult> UpdateCreditLimitAsync(Guid dealerId, decimal creditLimit, CancellationToken cancellationToken)
    {
        await updateCreditLimitValidator.ValidateAndThrowAsync(new UpdateCreditLimitRequest(creditLimit), cancellationToken);

        var dealer = await userRepository.GetByIdAsync(dealerId, cancellationToken);
        if (dealer is null || dealer.Role != UserRole.Dealer)
        {
            return new CreditLimitUpdateResult(false, "Dealer not found.");
        }

        var remoteUpdated = await creditLimitGateway.UpdateCreditLimitAsync(dealerId, creditLimit, cancellationToken);
        if (!remoteUpdated)
        {
            return new CreditLimitUpdateResult(false, "Failed to update credit limit in Payment service.");
        }

        dealer.UpdateCreditLimit(creditLimit);
        await userRepository.AddOutboxMessageAsync("DealerCreditLimitUpdated", new
        {
            dealer.UserId,
            creditLimit,
            occurredAtUtc = DateTime.UtcNow
        }, cancellationToken);

        await userRepository.SaveChangesAsync(cancellationToken);

        return new CreditLimitUpdateResult(true, "Credit limit updated successfully.");
    }

    public async Task<UserProfileDto?> GetProfileAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await userRepository.GetByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return null;
        }

        return new UserProfileDto(
            user.UserId,
            user.FullName,
            user.Email,
            user.Role.ToString(),
            user.Status.ToString(),
            user.CreditLimit,
            user.DealerProfile?.BusinessName,
            user.DealerProfile?.GstNumber,
            user.DealerProfile?.IsInterstate);
    }

    public async Task<InternalUserContactDto?> GetInternalUserContactAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await userRepository.GetByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return null;
        }

        return new InternalUserContactDto(
            user.UserId,
            user.FullName,
            user.Email,
            user.Role.ToString(),
            user.Status.ToString());
    }

    private static AuthResponse BuildAuthResponse(User user, AccessTokenEnvelope accessToken, RefreshTokenEnvelope refreshToken)
    {
        return new AuthResponse(
            user.UserId,
            user.Email,
            user.Role.ToString(),
            accessToken.Token,
            accessToken.ExpiresAtUtc,
            refreshToken.Token,
            refreshToken.ExpiresAtUtc);
    }
}
