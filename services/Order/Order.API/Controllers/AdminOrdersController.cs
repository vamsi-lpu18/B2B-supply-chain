using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Order.Application.Abstractions;
using Order.Application.DTOs;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;

namespace Order.API.Controllers;

[ApiController]
[Route("api/admin/orders")]
[Authorize(Roles = "Admin,Warehouse,Logistics")]
public sealed class AdminOrdersController(IOrderService orderService) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<OrderListItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll([FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] int? status = null, CancellationToken cancellationToken = default)
    {
        var result = await orderService.GetAllOrdersAsync(page, pageSize, status, cancellationToken);
        return Ok(result);
    }

    [HttpPut("{id:guid}/approve-hold")]
    public async Task<IActionResult> ApproveHold(Guid id, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var approved = await orderService.ApproveOnHoldAsync(id, userId, cancellationToken);
        return approved ? Ok(new { message = "On-hold order approved." }) : NotFound();
    }

    [HttpPut("{id:guid}/reject-hold")]
    public async Task<IActionResult> RejectHold(Guid id, [FromBody] AdminDecisionRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var reason = string.IsNullOrWhiteSpace(request.Reason) ? "Rejected by admin" : request.Reason;
        var rejected = await orderService.RejectOnHoldAsync(id, reason, userId, cancellationToken);
        return rejected ? Ok(new { message = "On-hold order rejected." }) : NotFound();
    }

    private bool TryGetUserId(out Guid userId)
    {
        var sub = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(sub, out userId);
    }
}
