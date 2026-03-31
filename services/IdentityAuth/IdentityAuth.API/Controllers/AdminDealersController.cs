using IdentityAuth.Application.Abstractions;
using IdentityAuth.Application.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IdentityAuth.API.Controllers;

[ApiController]
[Route("api/admin/dealers")]
[Authorize(Roles = "Admin")]
public sealed class AdminDealersController(IIdentityAuthService identityAuthService) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<DealerSummaryDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetDealers([FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] string? search = null, CancellationToken cancellationToken = default)
    {
        var result = await identityAuthService.GetDealersAsync(page, pageSize, search, cancellationToken);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(DealerDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetDealerById(Guid id, CancellationToken cancellationToken)
    {
        var dealer = await identityAuthService.GetDealerAsync(id, cancellationToken);
        return dealer is null ? NotFound() : Ok(dealer);
    }

    [HttpPut("{id:guid}/approve")]
    public async Task<IActionResult> ApproveDealer(Guid id, CancellationToken cancellationToken)
    {
        var approved = await identityAuthService.ApproveDealerAsync(id, cancellationToken);
        return approved ? Ok(new { message = "Dealer approved." }) : NotFound(new { message = "Dealer not found." });
    }

    [HttpPut("{id:guid}/reject")]
    public async Task<IActionResult> RejectDealer(Guid id, [FromBody] RejectDealerRequest request, CancellationToken cancellationToken)
    {
        var rejected = await identityAuthService.RejectDealerAsync(id, request.Reason, cancellationToken);
        return rejected ? Ok(new { message = "Dealer rejected." }) : NotFound(new { message = "Dealer not found." });
    }

    [HttpPut("{id:guid}/credit-limit")]
    public async Task<IActionResult> UpdateCreditLimit(Guid id, [FromBody] UpdateCreditLimitRequest request, CancellationToken cancellationToken)
    {
        var result = await identityAuthService.UpdateCreditLimitAsync(id, request.CreditLimit, cancellationToken);

        if (result.Succeeded)
        {
            return Ok(result);
        }

        if (result.Message.Contains("not found", StringComparison.OrdinalIgnoreCase))
        {
            return NotFound(result);
        }

        return StatusCode(StatusCodes.Status502BadGateway, result);
    }
}
