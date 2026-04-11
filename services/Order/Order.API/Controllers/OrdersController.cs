using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Order.Application.DTOs;
using Order.Application.Features.Orders;
using Order.Domain.Enums;
using MediatR;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;

namespace Order.API.Controllers;

[ApiController]
[Route("api/orders")]
[Authorize]
public sealed class OrdersController(ISender sender) : ControllerBase
{
    [HttpPost]
    [Authorize(Roles = "Dealer")]
    [ProducesResponseType(typeof(OrderDto), StatusCodes.Status201Created)]
    public async Task<IActionResult> Create([FromBody] CreateOrderRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var order = await sender.Send(new CreateOrderCommand(userId, request), cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = order.OrderId }, order);
    }

    [HttpGet("my")]
    [Authorize(Roles = "Dealer")]
    [ProducesResponseType(typeof(PagedResult<OrderListItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyOrders([FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken cancellationToken = default)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var result = await sender.Send(new GetDealerOrdersQuery(userId, page, pageSize), cancellationToken);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(OrderDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? string.Empty;
        var order = await sender.Send(new GetOrderQuery(id, userId, role), cancellationToken);
        return order is null ? NotFound() : Ok(order);
    }

    [HttpGet("{id:guid}/saga")]
    [ProducesResponseType(typeof(OrderSagaDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetSagaByOrderId(Guid id, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? string.Empty;
        var order = await sender.Send(new GetOrderQuery(id, userId, role), cancellationToken);
        if (order is null)
        {
            return NotFound();
        }

        return order.Saga is null
            ? NotFound(new { message = "Saga state not found for this order." })
            : Ok(order.Saga);
    }

    [HttpPut("{id:guid}/status")]
    [Authorize(Roles = "Admin,Warehouse,Logistics")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateOrderStatusRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? "System";
        var updated = await sender.Send(new UpdateOrderStatusCommand(id, request.NewStatus, userId, role), cancellationToken);
        return updated ? Ok(new { message = "Status updated." }) : NotFound();
    }

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Roles = "Dealer,Admin")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelOrderRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? "System";
        var cancelled = await sender.Send(new CancelOrderCommand(id, request.Reason, userId, role), cancellationToken);
        return cancelled ? Ok(new { message = "Order cancelled." }) : NotFound();
    }

    [HttpPost("{id:guid}/returns")]
    [Authorize(Roles = "Dealer")]
    public async Task<IActionResult> RequestReturn(Guid id, [FromBody] ReturnRequestDto request, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var requested = await sender.Send(new RequestReturnCommand(id, userId, request.Reason), cancellationToken);
        return requested ? Ok(new { message = "Return request submitted." }) : NotFound();
    }

    private bool TryGetUserId(out Guid userId)
    {
        var sub = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(sub, out userId);
    }
}
