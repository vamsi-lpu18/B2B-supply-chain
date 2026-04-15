using CatalogInventory.Application.DTOs;
using CatalogInventory.Application.Features.Catalog;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CatalogInventory.API.Controllers;

[ApiController]
[Route("api/internal/inventory")]
[AllowAnonymous]
public sealed class InternalInventoryController(
    ISender sender,
    IConfiguration configuration) : ControllerBase
{
    [HttpPost("soft-lock")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SoftLock([FromBody] SoftLockStockRequest request, CancellationToken cancellationToken)
    {
        if (!IsAuthorizedInternalCall())
        {
            return Unauthorized(new { message = "Invalid internal API key." });
        }

        var success = await sender.Send(new SoftLockStockCommand(request), cancellationToken);
        return success ? Ok(new { message = "Stock soft-locked." }) : Conflict(new { message = "Stock soft-lock failed." });
    }

    [HttpPost("hard-deduct")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> HardDeduct([FromBody] HardDeductStockRequest request, CancellationToken cancellationToken)
    {
        if (!IsAuthorizedInternalCall())
        {
            return Unauthorized(new { message = "Invalid internal API key." });
        }

        var success = await sender.Send(new HardDeductStockCommand(request), cancellationToken);
        return success ? Ok(new { message = "Stock hard-deducted." }) : Conflict(new { message = "Hard deduct failed." });
    }

    [HttpPost("release-soft-lock")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> ReleaseSoftLock([FromBody] ReleaseSoftLockRequest request, CancellationToken cancellationToken)
    {
        if (!IsAuthorizedInternalCall())
        {
            return Unauthorized(new { message = "Invalid internal API key." });
        }

        var success = await sender.Send(new ReleaseSoftLockCommand(request), cancellationToken);
        return success ? Ok(new { message = "Soft-lock released." }) : Conflict(new { message = "Soft-lock release failed." });
    }

    [HttpPost("restock")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Restock([FromBody] InternalRestockRequest request, CancellationToken cancellationToken)
    {
        if (!IsAuthorizedInternalCall())
        {
            return Unauthorized(new { message = "Invalid internal API key." });
        }

        var success = await sender.Send(
            new RestockProductCommand(
                request.ProductId,
                new RestockProductRequest(request.Quantity, request.ReferenceId)),
            cancellationToken);

        return success ? Ok(new { message = "Stock restocked." }) : Conflict(new { message = "Stock restock failed." });
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

    public sealed record InternalRestockRequest(Guid ProductId, int Quantity, string ReferenceId);
}
