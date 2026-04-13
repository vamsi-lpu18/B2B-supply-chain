using IdentityAuth.Application.DTOs;
using IdentityAuth.Application.Features.Auth;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IdentityAuth.API.Controllers;

[ApiController]
[Route("api/admin/users")]
[Authorize]
public sealed class AdminUsersController(ISender sender) : ControllerBase
{
    [HttpGet("agents")]
    [Authorize(Roles = "Admin,Logistics")]
    [ProducesResponseType(typeof(PagedResult<AgentSummaryDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAgents([FromQuery] int page = 1, [FromQuery] int pageSize = 50, [FromQuery] string? search = null, CancellationToken cancellationToken = default)
    {
        var result = await sender.Send(new GetAgentsQuery(page, pageSize, search), cancellationToken);
        return Ok(result);
    }

    [HttpPost("agents")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(CreateAgentResponse), StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateAgent([FromBody] CreateAgentRequest request, CancellationToken cancellationToken)
    {
        var created = await sender.Send(new CreateAgentCommand(request), cancellationToken);
        return StatusCode(StatusCodes.Status201Created, created);
    }
}
