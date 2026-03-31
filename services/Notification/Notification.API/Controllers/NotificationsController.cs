using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Notification.Application.Abstractions;
using Notification.Application.DTOs;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;

namespace Notification.API.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize]
public sealed class NotificationsController(INotificationService notificationService) : ControllerBase
{
    [HttpPost("manual")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(NotificationDto), StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateManual([FromBody] CreateManualNotificationRequest request, CancellationToken cancellationToken)
    {
        var created = await notificationService.CreateManualAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { notificationId = created.NotificationId }, created);
    }

    [HttpPost("ingest")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(NotificationDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> Ingest([FromBody] IngestIntegrationEventRequest request, CancellationToken cancellationToken)
    {
        var created = await notificationService.IngestIntegrationEventAsync(request, cancellationToken);
        return Ok(created);
    }

    [HttpGet("my")]
    [ProducesResponseType(typeof(IReadOnlyList<NotificationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMy(CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var notifications = await notificationService.GetByRecipientAsync(userId, cancellationToken);
        return Ok(notifications);
    }

    [HttpGet]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<NotificationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        var notifications = await notificationService.GetAllAsync(cancellationToken);
        return Ok(notifications);
    }

    [HttpGet("{notificationId:guid}")]
    [ProducesResponseType(typeof(NotificationDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid notificationId, CancellationToken cancellationToken)
    {
        var notification = await notificationService.GetByIdAsync(notificationId, cancellationToken);
        if (notification is null)
        {
            return NotFound();
        }

        if (User.IsInRole("Admin"))
        {
            return Ok(notification);
        }

        if (!TryGetUserId(out var userId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        if (notification.RecipientUserId is not null && notification.RecipientUserId != userId)
        {
            return NotFound();
        }

        return Ok(notification);
    }

    [HttpPut("{notificationId:guid}/sent")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> MarkSent(Guid notificationId, CancellationToken cancellationToken)
    {
        var updated = await notificationService.MarkSentAsync(notificationId, cancellationToken);
        return updated ? Ok(new { message = "Notification marked sent." }) : NotFound();
    }

    [HttpPut("{notificationId:guid}/failed")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> MarkFailed(Guid notificationId, [FromBody] MarkNotificationFailedRequest request, CancellationToken cancellationToken)
    {
        var updated = await notificationService.MarkFailedAsync(notificationId, request.FailureReason, cancellationToken);
        return updated ? Ok(new { message = "Notification marked failed." }) : NotFound();
    }

    private bool TryGetUserId(out Guid userId)
    {
        var sub = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(sub, out userId);
    }
}
