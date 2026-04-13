using LogisticsTracking.Application.DTOs;
using LogisticsTracking.Application.Features.Shipments;
using LogisticsTracking.Domain.Enums;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;

namespace LogisticsTracking.API.Controllers;

[ApiController]
[Route("api/logistics/shipments")]
[Authorize]
public sealed class ShipmentsController(ISender sender) : ControllerBase
{
    [HttpPost]
    [Authorize(Roles = "Admin,Logistics")]
    [ProducesResponseType(typeof(ShipmentDto), StatusCodes.Status201Created)]
    public async Task<IActionResult> Create([FromBody] CreateShipmentRequest request, CancellationToken cancellationToken)
    {
        var (userId, role) = GetActor();
        var shipment = await sender.Send(new CreateShipmentCommand(request, userId, role), cancellationToken);
        return CreatedAtAction(nameof(GetById), new { shipmentId = shipment.ShipmentId }, shipment);
    }

    [HttpGet("{shipmentId:guid}")]
    [Authorize(Roles = "Admin,Logistics,Agent,Dealer")]
    [ProducesResponseType(typeof(ShipmentDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById([FromRoute] Guid shipmentId, CancellationToken cancellationToken)
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? string.Empty;
        var shipment = await sender.Send(new GetShipmentQuery(shipmentId), cancellationToken);
        if (shipment is null)
        {
            return NotFound();
        }

        if (string.Equals(role, "Dealer", StringComparison.Ordinal) || string.Equals(role, "Agent", StringComparison.Ordinal))
        {
            if (!TryGetUserId(out var userId))
            {
                return Unauthorized(new { message = "Invalid token." });
            }

            if (string.Equals(role, "Dealer", StringComparison.Ordinal) && shipment.DealerId != userId)
            {
                return NotFound();
            }

            if (string.Equals(role, "Agent", StringComparison.Ordinal) && shipment.AssignedAgentId != userId)
            {
                return NotFound();
            }
        }

        return Ok(shipment);
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

        var shipments = await sender.Send(new GetDealerShipmentsQuery(dealerId), cancellationToken);
        return Ok(shipments);
    }

    [HttpGet]
    [Authorize(Roles = "Admin,Logistics")]
    [ProducesResponseType(typeof(IReadOnlyList<ShipmentDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        var shipments = await sender.Send(new GetAllShipmentsQuery(), cancellationToken);
        return Ok(shipments);
    }

    [HttpGet("assigned")]
    [Authorize(Roles = "Agent")]
    [ProducesResponseType(typeof(IReadOnlyList<ShipmentDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAssigned(CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var agentId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var shipments = await sender.Send(new GetAgentShipmentsQuery(agentId), cancellationToken);
        return Ok(shipments);
    }

    [HttpPut("{shipmentId:guid}/assign-agent")]
    [Authorize(Roles = "Admin,Logistics")]
    public async Task<IActionResult> AssignAgent([FromRoute] Guid shipmentId, [FromBody] AssignAgentRequest request, CancellationToken cancellationToken)
    {
        var (userId, role) = GetActor();
        var updated = await sender.Send(new AssignAgentCommand(shipmentId, request.AgentId, userId, role), cancellationToken);
        return updated ? Ok(new { message = "Agent assigned." }) : NotFound();
    }

    [HttpPut("{shipmentId:guid}/assignment/accept")]
    [Authorize(Roles = "Agent")]
    public async Task<IActionResult> AcceptAssignment([FromRoute] Guid shipmentId, CancellationToken cancellationToken)
    {
        var (userId, role) = GetActor();
        var updated = await sender.Send(new AcceptAssignmentCommand(shipmentId, userId, userId, role), cancellationToken);
        return updated ? Ok(new { message = "Assignment accepted." }) : NotFound();
    }

    [HttpPut("{shipmentId:guid}/assignment/reject")]
    [Authorize(Roles = "Agent")]
    public async Task<IActionResult> RejectAssignment([FromRoute] Guid shipmentId, [FromBody] RejectAssignmentRequest request, CancellationToken cancellationToken)
    {
        var (userId, role) = GetActor();
        var updated = await sender.Send(new RejectAssignmentCommand(shipmentId, userId, request.Reason, userId, role), cancellationToken);
        return updated ? Ok(new { message = "Assignment rejected." }) : NotFound();
    }

    [HttpPut("{shipmentId:guid}/agent-rating")]
    [Authorize(Roles = "Dealer")]
    public async Task<IActionResult> RateDeliveryAgent([FromRoute] Guid shipmentId, [FromBody] RateDeliveryAgentRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var dealerId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var shipment = await sender.Send(new GetShipmentQuery(shipmentId), cancellationToken);
        if (shipment is null || shipment.DealerId != dealerId)
        {
            return NotFound();
        }

        var (userId, role) = GetActor();
        var updated = await sender.Send(new RateDeliveryAgentCommand(shipmentId, request.Rating, request.Comment, userId, role), cancellationToken);
        return updated ? Ok(new { message = "Delivery agent rated." }) : NotFound();
    }

    [HttpPut("{shipmentId:guid}/assign-vehicle")]
    [Authorize(Roles = "Admin,Logistics")]
    public async Task<IActionResult> AssignVehicle([FromRoute] Guid shipmentId, [FromBody] AssignVehicleRequest request, CancellationToken cancellationToken)
    {
        var (userId, role) = GetActor();
        var updated = await sender.Send(new AssignVehicleCommand(shipmentId, request.VehicleNumber, userId, role), cancellationToken);
        return updated ? Ok(new { message = "Vehicle assigned." }) : NotFound();
    }

    [HttpPut("{shipmentId:guid}/status")]
    [Authorize(Roles = "Admin,Logistics,Agent")]
    public async Task<IActionResult> UpdateStatus([FromRoute] Guid shipmentId, [FromBody] UpdateShipmentStatusRequest request, CancellationToken cancellationToken)
    {
        var (userId, role) = GetActor();

        if (string.Equals(role, "Agent", StringComparison.Ordinal))
        {
            var shipment = await sender.Send(new GetShipmentQuery(shipmentId), cancellationToken);
            if (shipment is null || shipment.AssignedAgentId != userId)
            {
                return NotFound();
            }

            if (shipment.AssignmentDecisionStatus != AssignmentDecisionStatus.Accepted)
            {
                return Conflict(new { message = "Assignment must be accepted before updating shipment status." });
            }
        }

        var updated = await sender.Send(new UpdateShipmentStatusCommand(shipmentId, request.Status, request.Note, userId, role), cancellationToken);
        return updated ? Ok(new { message = "Shipment status updated." }) : NotFound();
    }

    [HttpGet("{shipmentId:guid}/ops-state")]
    [Authorize(Roles = "Admin,Logistics,Agent,Dealer")]
    [ProducesResponseType(typeof(ShipmentOpsStateDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetOpsState([FromRoute] Guid shipmentId, CancellationToken cancellationToken)
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? string.Empty;
        if (string.Equals(role, "Dealer", StringComparison.Ordinal) || string.Equals(role, "Agent", StringComparison.Ordinal))
        {
            if (!TryGetUserId(out var userId))
            {
                return Unauthorized(new { message = "Invalid token." });
            }

            var shipment = await sender.Send(new GetShipmentQuery(shipmentId), cancellationToken);
            if (shipment is null)
            {
                return NotFound();
            }

            if (string.Equals(role, "Dealer", StringComparison.Ordinal) && shipment.DealerId != userId)
            {
                return NotFound();
            }

            if (string.Equals(role, "Agent", StringComparison.Ordinal) && shipment.AssignedAgentId != userId)
            {
                return NotFound();
            }
        }

        var state = await sender.Send(new GetShipmentOpsStateQuery(shipmentId), cancellationToken);
        return state is null ? NotFound() : Ok(state);
    }

    [HttpPost("ops-states/batch")]
    [Authorize(Roles = "Admin,Logistics,Agent,Dealer")]
    [ProducesResponseType(typeof(IReadOnlyList<ShipmentOpsStateDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetOpsStatesBatch([FromBody] GetShipmentOpsStatesRequest request, CancellationToken cancellationToken)
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? string.Empty;
        if ((string.Equals(role, "Dealer", StringComparison.Ordinal) || string.Equals(role, "Agent", StringComparison.Ordinal))
            && request.ShipmentIds.Count > 0)
        {
            if (!TryGetUserId(out var userId))
            {
                return Unauthorized(new { message = "Invalid token." });
            }

            var allowedShipments = new List<Guid>(request.ShipmentIds.Count);
            foreach (var shipmentId in request.ShipmentIds)
            {
                var shipment = await sender.Send(new GetShipmentQuery(shipmentId), cancellationToken);
                if (shipment is null)
                {
                    continue;
                }

                if (string.Equals(role, "Dealer", StringComparison.Ordinal) && shipment.DealerId == userId)
                {
                    allowedShipments.Add(shipmentId);
                }

                if (string.Equals(role, "Agent", StringComparison.Ordinal) && shipment.AssignedAgentId == userId)
                {
                    allowedShipments.Add(shipmentId);
                }
            }

            request = request with { ShipmentIds = allowedShipments };
        }

        var states = await sender.Send(new GetShipmentOpsStatesQuery(request), cancellationToken);
        return Ok(states);
    }

    [HttpPut("{shipmentId:guid}/ops-state")]
    [Authorize(Roles = "Admin,Logistics")]
    [ProducesResponseType(typeof(ShipmentOpsStateDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpsertOpsState([FromRoute] Guid shipmentId, [FromBody] UpsertShipmentOpsStateRequest request, CancellationToken cancellationToken)
    {
        var state = await sender.Send(new UpsertShipmentOpsStateCommand(shipmentId, request), cancellationToken);
        return state is null ? NotFound() : Ok(state);
    }

    [HttpPost("{shipmentId:guid}/ai-recommendation")]
    [Authorize(Roles = "Admin,Logistics")]
    [ProducesResponseType(typeof(ShipmentAiRecommendationDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GenerateAiRecommendation([FromRoute] Guid shipmentId, CancellationToken cancellationToken)
    {
        var (userId, role) = GetActor();
        var recommendation = await sender.Send(new GenerateAiRecommendationCommand(shipmentId, userId, role), cancellationToken);
        return recommendation is null ? NotFound() : Ok(recommendation);
    }

    [HttpPost("ai-recommendations/{recommendationId:guid}/approve")]
    [Authorize(Roles = "Admin,Logistics")]
    [ProducesResponseType(typeof(ApproveAiRecommendationResultDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ApproveAiRecommendation([FromRoute] Guid recommendationId, CancellationToken cancellationToken)
    {
        var (userId, role) = GetActor();
        var result = await sender.Send(new ApproveAiRecommendationCommand(recommendationId, userId, role), cancellationToken);
        return result is null ? NotFound() : Ok(result);
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
