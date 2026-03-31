using CatalogInventory.Application.Abstractions;
using CatalogInventory.Application.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CatalogInventory.API.Controllers;

[ApiController]
[Route("api/inventory")]
[Authorize]
public sealed class InventoryController(ICatalogInventoryService catalogService) : ControllerBase
{
    [HttpPost("soft-lock")]
    [Authorize(Roles = "Admin,Dealer,OrderService")]
    public async Task<IActionResult> SoftLock([FromBody] SoftLockStockRequest request, CancellationToken cancellationToken)
    {
        var success = await catalogService.SoftLockStockAsync(request, cancellationToken);
        return success ? Ok(new { message = "Stock soft-locked." }) : Conflict(new { message = "Stock soft-lock failed." });
    }

    [HttpPost("hard-deduct")]
    [Authorize(Roles = "Admin,Warehouse,Logistics")]
    public async Task<IActionResult> HardDeduct([FromBody] HardDeductStockRequest request, CancellationToken cancellationToken)
    {
        var success = await catalogService.HardDeductStockAsync(request, cancellationToken);
        return success ? Ok(new { message = "Stock hard-deducted." }) : Conflict(new { message = "Hard deduct failed." });
    }

    [HttpPost("release-soft-lock")]
    [Authorize(Roles = "Admin,OrderService")]
    public async Task<IActionResult> ReleaseSoftLock([FromBody] ReleaseSoftLockRequest request, CancellationToken cancellationToken)
    {
        var success = await catalogService.ReleaseSoftLockAsync(request, cancellationToken);
        return success ? Ok(new { message = "Soft-lock released." }) : NotFound();
    }

    [HttpPost("subscriptions")]
    [Authorize(Roles = "Dealer")]
    public async Task<IActionResult> Subscribe([FromBody] StockSubscriptionRequest request, CancellationToken cancellationToken)
    {
        var success = await catalogService.SubscribeStockAsync(request, cancellationToken);
        return success ? Ok(new { message = "Subscribed." }) : BadRequest();
    }

    [HttpDelete("subscriptions")]
    [Authorize(Roles = "Dealer")]
    public async Task<IActionResult> Unsubscribe([FromBody] StockSubscriptionRequest request, CancellationToken cancellationToken)
    {
        var success = await catalogService.UnsubscribeStockAsync(request, cancellationToken);
        return success ? Ok(new { message = "Unsubscribed." }) : NotFound();
    }
}
