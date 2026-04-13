using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Notification.Application.DTOs;
using Notification.Application.Features.Notifications;
using MediatR;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;

namespace Notification.API.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize]
public sealed class NotificationsController(
    ISender sender,
    IConfiguration configuration) : ControllerBase
{
    [HttpPost("manual")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(NotificationDto), StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateManual([FromBody] CreateManualNotificationRequest request, CancellationToken cancellationToken)
    {
        var created = await sender.Send(new CreateManualNotificationCommand(request), cancellationToken);
        return CreatedAtAction(nameof(GetById), new { notificationId = created.NotificationId }, created);
    }

    [HttpPost("ingest")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(NotificationDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Ingest([FromBody] IngestIntegrationEventRequest request, CancellationToken cancellationToken)
    {
        if (!IsAuthorizedInternalCall())
        {
            return Unauthorized(new { message = "Invalid internal API key." });
        }

        var created = await sender.Send(new IngestIntegrationEventCommand(request), cancellationToken);
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

        var notifications = await sender.Send(new GetNotificationsByRecipientQuery(userId), cancellationToken);
        return Ok(notifications);
    }

    [HttpGet]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<NotificationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        var notifications = await sender.Send(new GetAllNotificationsQuery(), cancellationToken);
        return Ok(notifications);
    }

    [HttpGet("{notificationId:guid}")]
    [ProducesResponseType(typeof(NotificationDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid notificationId, CancellationToken cancellationToken)
    {
        var notification = await sender.Send(new GetNotificationByIdQuery(notificationId), cancellationToken);
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
        var updated = await sender.Send(new MarkNotificationSentCommand(notificationId), cancellationToken);
        return updated ? Ok(new { message = "Notification marked sent." }) : NotFound();
    }

    [HttpPut("{notificationId:guid}/failed")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> MarkFailed(Guid notificationId, [FromBody] MarkNotificationFailedRequest request, CancellationToken cancellationToken)
    {
        var updated = await sender.Send(new MarkNotificationFailedCommand(notificationId, request.FailureReason), cancellationToken);
        return updated ? Ok(new { message = "Notification marked failed." }) : NotFound();
    }

    [HttpPut("{notificationId:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid notificationId, CancellationToken cancellationToken)
    {
        var notification = await sender.Send(new GetNotificationByIdQuery(notificationId), cancellationToken);
        if (notification is null)
        {
            return NotFound();
        }

        if (!User.IsInRole("Admin"))
        {
            if (!TryGetUserId(out var userId))
            {
                return Unauthorized(new { message = "Invalid token." });
            }

            if (notification.RecipientUserId is not null && notification.RecipientUserId != userId)
            {
                return NotFound();
            }
        }

        var updated = await sender.Send(new MarkNotificationReadCommand(notificationId), cancellationToken);
        return updated ? Ok(new { message = "Notification marked read." }) : NotFound();
    }

    [HttpPut("{notificationId:guid}/unread")]
    public async Task<IActionResult> MarkUnread(Guid notificationId, CancellationToken cancellationToken)
    {
        var notification = await sender.Send(new GetNotificationByIdQuery(notificationId), cancellationToken);
        if (notification is null)
        {
            return NotFound();
        }

        if (!User.IsInRole("Admin"))
        {
            if (!TryGetUserId(out var userId))
            {
                return Unauthorized(new { message = "Invalid token." });
            }

            if (notification.RecipientUserId is not null && notification.RecipientUserId != userId)
            {
                return NotFound();
            }
        }

        var updated = await sender.Send(new MarkNotificationUnreadCommand(notificationId), cancellationToken);
        return updated ? Ok(new { message = "Notification marked unread." }) : NotFound();
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

    private bool TryGetUserId(out Guid userId)
    {
        var sub = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(sub, out userId);
    }
}
