using IdentityAuth.Application.Features.Auth;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IdentityAuth.API.Controllers;

[ApiController]
[Route("api/internal/users")]
[AllowAnonymous]
public sealed class InternalUsersController(
    ISender sender,
    IConfiguration configuration) : ControllerBase
{
    [HttpGet("{id:guid}/contact")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetContact(Guid id, CancellationToken cancellationToken)
    {
        if (!IsAuthorizedInternalCall())
        {
            return Unauthorized(new { message = "Invalid internal API key." });
        }

        var contact = await sender.Send(new GetInternalUserContactQuery(id), cancellationToken);
        return contact is null ? NotFound() : Ok(contact);
    }

    private bool IsAuthorizedInternalCall()
    {
        var expectedKey = configuration["InternalApi:Key"];
        if (string.IsNullOrWhiteSpace(expectedKey))
        {
            return false;
        }

        if (!Request.Headers.TryGetValue("X-Internal-Api-Key", out var providedKey))
        {
            return false;
        }

        return string.Equals(providedKey.ToString(), expectedKey, StringComparison.Ordinal);
    }
}
