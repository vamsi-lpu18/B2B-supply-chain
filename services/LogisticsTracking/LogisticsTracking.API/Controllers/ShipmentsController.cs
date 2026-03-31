using LogisticsTracking.Application.Abstractions;
using LogisticsTracking.Application.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;

namespace LogisticsTracking.API.Controllers;

[ApiController]
[Route("api/logistics/shipments")]
[Authorize]
public sealed class ShipmentsController(ILogisticsService logisticsService) : ControllerBase
{
    [HttpPost]
    [Authorize(Roles = "Admin,Warehouse,Logistics")]
    [ProducesResponseType(typeof(ShipmentDto), StatusCodes.Status201Created)]
    public async Task<IActionResult> Create([FromBody] CreateShipmentRequest request, CancellationToken cancellationToken)
    {
        var (userId, role) = GetActor();
        var shipment = await logisticsService.CreateShipmentAsync(request, userId, role, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { shipmentId = shipment.ShipmentId }, shipment);
    }

    [HttpGet("{shipmentId:guid}")]
    [ProducesResponseType(typeof(ShipmentDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById([FromRoute] Guid shipmentId, CancellationToken cancellationToken)
    {
        var shipment = await logisticsService.GetShipmentAsync(shipmentId, cancellationToken);
        return shipment is null ? NotFound() : Ok(shipment);
    }

    [HttpGet("my")]
    [Authorize(Roles = "Dealer")]
    [ProducesResponseType(typeof(IReadOnlyList<ShipmentDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMine(CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var dealerId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var shipments = await logisticsService.GetDealerShipmentsAsync(dealerId, cancellationToken);
        return Ok(shipments);
    }

    [HttpGet]
    [Authorize(Roles = "Admin,Warehouse,Logistics,Agent")]
    [ProducesResponseType(typeof(IReadOnlyList<ShipmentDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        var shipments = await logisticsService.GetAllShipmentsAsync(cancellationToken);
        return Ok(shipments);
    }

    [HttpPut("{shipmentId:guid}/assign-agent")]
    [Authorize(Roles = "Admin,Logistics")]
    public async Task<IActionResult> AssignAgent([FromRoute] Guid shipmentId, [FromBody] AssignAgentRequest request, CancellationToken cancellationToken)
    {
        var (userId, role) = GetActor();
        var updated = await logisticsService.AssignAgentAsync(shipmentId, request.AgentId, userId, role, cancellationToken);
        return updated ? Ok(new { message = "Agent assigned." }) : NotFound();
    }

    [HttpPut("{shipmentId:guid}/assign-vehicle")]
    [Authorize(Roles = "Admin,Logistics")]
    public async Task<IActionResult> AssignVehicle([FromRoute] Guid shipmentId, [FromBody] AssignVehicleRequest request, CancellationToken cancellationToken)
    {
        var (userId, role) = GetActor();
        var updated = await logisticsService.AssignVehicleAsync(shipmentId, request.VehicleNumber, userId, role, cancellationToken);
        return updated ? Ok(new { message = "Vehicle assigned." }) : NotFound();
    }

    [HttpPut("{shipmentId:guid}/status")]
    [Authorize(Roles = "Admin,Logistics,Agent")]
    public async Task<IActionResult> UpdateStatus([FromRoute] Guid shipmentId, [FromBody] UpdateShipmentStatusRequest request, CancellationToken cancellationToken)
    {
        var (userId, role) = GetActor();
        var updated = await logisticsService.UpdateShipmentStatusAsync(shipmentId, request.Status, request.Note, userId, role, cancellationToken);
        return updated ? Ok(new { message = "Shipment status updated." }) : NotFound();
    }

    private (Guid UserId, string Role) GetActor()
    {
        var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? "System";

        if (!TryGetUserId(out var userId))
        {
            userId = Guid.Empty;
        }

        return (userId, role);
    }

    private bool TryGetUserId(out Guid userId)
    {
        var sub = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(sub, out userId);
    }
}
