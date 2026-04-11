using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Order.Application.DTOs;
using Order.Application.Features.Orders;
using MediatR;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;

namespace Order.API.Controllers;

[ApiController]
[Route("api/admin/orders")]
[Authorize(Roles = "Admin,Warehouse,Logistics")]
public sealed class AdminOrdersController(ISender sender) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<OrderListItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll([FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] int? status = null, CancellationToken cancellationToken = default)
    {
        var result = await sender.Send(new GetAllOrdersQuery(page, pageSize, status), cancellationToken);
        return Ok(result);
    }

    [HttpPost("bulk-status")]
    [ProducesResponseType(typeof(BulkUpdateOrderStatusResultDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> BulkUpdateStatus([FromBody] BulkUpdateOrderStatusRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? "System";
        var result = await sender.Send(new BulkUpdateOrderStatusCommand(request, userId, role), cancellationToken);
        return Ok(result);
    }

    [HttpPut("{id:guid}/approve-hold")]
    public async Task<IActionResult> ApproveHold(Guid id, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var approved = await sender.Send(new ApproveOnHoldCommand(id, userId), cancellationToken);
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
        var rejected = await sender.Send(new RejectOnHoldCommand(id, reason, userId), cancellationToken);
        return rejected ? Ok(new { message = "On-hold order rejected." }) : NotFound();
    }

    [HttpPut("{id:guid}/approve-return")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ApproveReturn(Guid id, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var approved = await sender.Send(new ApproveReturnCommand(id, userId), cancellationToken);
        return approved ? Ok(new { message = "Return approved." }) : NotFound();
    }

    [HttpPut("{id:guid}/reject-return")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> RejectReturn(Guid id, [FromBody] AdminDecisionRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var reason = string.IsNullOrWhiteSpace(request.Reason) ? "Rejected by admin" : request.Reason;
        var rejected = await sender.Send(new RejectReturnCommand(id, reason, userId), cancellationToken);
        return rejected ? Ok(new { message = "Return rejected." }) : NotFound();
    }

    private bool TryGetUserId(out Guid userId)
    {
        var sub = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(sub, out userId);
    }
}
