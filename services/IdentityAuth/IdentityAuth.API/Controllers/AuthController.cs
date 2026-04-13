using IdentityAuth.Application.DTOs;
using IdentityAuth.Application.Features.Auth;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;

namespace IdentityAuth.API.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(ISender sender) : ControllerBase
{
    [HttpPost("register")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(RegisterDealerResponse), StatusCodes.Status201Created)]
    public async Task<IActionResult> Register([FromBody] RegisterDealerRequest request, CancellationToken cancellationToken)
    {
        var response = await sender.Send(new RegisterDealerCommand(request), cancellationToken);
        return CreatedAtAction(nameof(Register), new { id = response.UserId }, response);
    }

    [HttpPost("login")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken cancellationToken)
    {
        var response = await sender.Send(new LoginCommand(request), cancellationToken);
        SetRefreshCookie(response.RefreshToken, response.RefreshTokenExpiresAtUtc);
        return Ok(response with { RefreshToken = string.Empty });
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Refresh(CancellationToken cancellationToken)
    {
        if (!Request.Cookies.TryGetValue("refreshToken", out var refreshToken) || string.IsNullOrWhiteSpace(refreshToken))
        {
            return Unauthorized(new { message = "Refresh token cookie is missing." });
        }

        var response = await sender.Send(new RefreshTokenCommand(refreshToken), cancellationToken);
        SetRefreshCookie(response.RefreshToken, response.RefreshTokenExpiresAtUtc);
        return Ok(response with { RefreshToken = string.Empty });
    }

    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request, CancellationToken cancellationToken)
    {
        await sender.Send(new ForgotPasswordCommand(request), cancellationToken);
        return Ok(new { message = "If the account exists, an OTP has been sent." });
    }

    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request, CancellationToken cancellationToken)
    {
        await sender.Send(new ResetPasswordCommand(request), cancellationToken);
        return Ok(new { message = "Password reset successful." });
    }

    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        var userIdClaim = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { message = "Invalid access token." });
        }

        await sender.Send(new ChangePasswordCommand(userId, request), cancellationToken);
        return Ok(new { message = "Password changed successfully." });
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout([FromBody] LogoutRequest? request, CancellationToken cancellationToken)
    {
        var userIdClaim = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { message = "Invalid access token." });
        }

        var jti = User.FindFirst(JwtRegisteredClaimNames.Jti)?.Value;
        var expRaw = User.FindFirst(JwtRegisteredClaimNames.Exp)?.Value;

        DateTime? tokenExpiresAtUtc = null;
        if (long.TryParse(expRaw, out var expUnix))
        {
            tokenExpiresAtUtc = DateTimeOffset.FromUnixTimeSeconds(expUnix).UtcDateTime;
        }

        await sender.Send(
            new LogoutCommand(userId, jti, tokenExpiresAtUtc, request?.RefreshToken),
            cancellationToken);

        Response.Cookies.Delete("refreshToken");
        return Ok(new { message = "Logged out successfully." });
    }

    private void SetRefreshCookie(string refreshToken, DateTime expiresAtUtc)
    {
        Response.Cookies.Append("refreshToken", refreshToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = false,
            SameSite = SameSiteMode.Strict,
            Expires = expiresAtUtc
        });
    }
}
