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
/// <summary>
/// Gets the saga state for a specific order. This endpoint is used to track the progress of an order through its various stages.
/// </summary> <param name="id">The unique identifier of the order.</param>
/// <param name="cancellationToken">A token to cancel the operation if needed.</param>
/// <returns>The current saga state of the order, or a 404 if the order or saga state is not found.</returns>   
/// <remarks>
/// This endpoint is typically used by the frontend to display the order's progress in a visual format, such as a progress bar or timeline. It allows customers and internal users to see which stages of the order process have been completed and which are still pending.
/// </remarks>
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
    [Authorize]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateOrderStatusRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? "System";
        if (!CanManageOrderStatus(role))
        {
            return Forbid();
        }

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

    private static bool CanManageOrderStatus(string role)
    {
        return string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase)
            || string.Equals(role, "Logistics", StringComparison.OrdinalIgnoreCase)
            || string.Equals(role, "Warehouse", StringComparison.OrdinalIgnoreCase);
    }
}
