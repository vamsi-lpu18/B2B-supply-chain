using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PaymentInvoice.Application.Abstractions;
using PaymentInvoice.Application.DTOs;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace PaymentInvoice.API.Controllers;

[ApiController]
[Route("api/payment")]
[Authorize]
public sealed class PaymentController(IPaymentInvoiceService paymentInvoiceService, IConfiguration configuration) : ControllerBase
{
    [HttpPost("gateway/orders")]
    [Authorize(Roles = "Dealer")]
    [ProducesResponseType(typeof(GatewayOrderDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> CreateGatewayOrder([FromBody] CreateGatewayOrderRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var dealerId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var result = await paymentInvoiceService.CreateGatewayOrderAsync(dealerId, request, cancellationToken);
        return Ok(result);
    }

    [HttpPost("gateway/verify")]
    [Authorize(Roles = "Dealer")]
    [ProducesResponseType(typeof(GatewayPaymentVerificationDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> VerifyGatewayPayment([FromBody] VerifyGatewayPaymentRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var dealerId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var result = await paymentInvoiceService.VerifyGatewayPaymentAsync(dealerId, request, cancellationToken);
        return Ok(result);
    }

    [HttpPost("dealers/{dealerId:guid}/account")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(DealerCreditAccountDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> SeedDealerAccount(Guid dealerId, [FromBody] SeedDealerAccountRequest request, CancellationToken cancellationToken)
    {
        var account = await paymentInvoiceService.EnsureDealerAccountAsync(dealerId, request.InitialCreditLimit, cancellationToken);
        return Ok(account);
    }

    [HttpGet("dealers/{dealerId:guid}/credit-check")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(CreditCheckResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> CheckCredit(Guid dealerId, [FromQuery] decimal amount, CancellationToken cancellationToken)
    {
        var result = await paymentInvoiceService.CheckCreditAsync(dealerId, amount, cancellationToken);
        return Ok(result);
    }

    [HttpPut("dealers/{dealerId:guid}/credit-limit")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(DealerCreditAccountDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateCreditLimit(Guid dealerId, [FromBody] UpdateCreditLimitRequest request, CancellationToken cancellationToken)
    {
        var updated = await paymentInvoiceService.UpdateCreditLimitAsync(dealerId, request.CreditLimit, cancellationToken);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpPut("internal/dealers/{dealerId:guid}/credit-limit")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(DealerCreditAccountDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateCreditLimitInternal(Guid dealerId, [FromBody] UpdateCreditLimitRequest request, CancellationToken cancellationToken)
    {
        if (!IsAuthorizedInternalCall())
        {
            return Unauthorized(new { message = "Invalid internal API key." });
        }

        var updated = await paymentInvoiceService.UpdateCreditLimitAsync(dealerId, request.CreditLimit, cancellationToken);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpPost("dealers/{dealerId:guid}/settlements")]
    [Authorize(Roles = "Admin,Dealer")]
    [ProducesResponseType(typeof(DealerCreditAccountDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SettleOutstanding(Guid dealerId, [FromBody] SettleOutstandingRequest request, CancellationToken cancellationToken)
    {
        var updated = await paymentInvoiceService.SettleOutstandingAsync(dealerId, request.Amount, request.ReferenceNo, cancellationToken);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpPost("invoices")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(InvoiceDto), StatusCodes.Status201Created)]
    public async Task<IActionResult> GenerateInvoice([FromBody] GenerateInvoiceRequest request, CancellationToken cancellationToken)
    {
        var invoice = await paymentInvoiceService.GenerateInvoiceAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetInvoiceById), new { invoiceId = invoice.InvoiceId }, invoice);
    }

    [HttpGet("invoices/{invoiceId:guid}")]
    [Authorize(Roles = "Admin,Dealer")]
    [ProducesResponseType(typeof(InvoiceDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetInvoiceById(Guid invoiceId, CancellationToken cancellationToken)
    {
        var invoice = await paymentInvoiceService.GetInvoiceAsync(invoiceId, cancellationToken);
        return invoice is null ? NotFound() : Ok(invoice);
    }

    [HttpGet("dealers/{dealerId:guid}/invoices")]
    [Authorize(Roles = "Admin,Dealer")]
    [ProducesResponseType(typeof(IReadOnlyList<InvoiceDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetDealerInvoices(Guid dealerId, CancellationToken cancellationToken)
    {
        var invoices = await paymentInvoiceService.GetDealerInvoicesAsync(dealerId, cancellationToken);
        return Ok(invoices);
    }

    [HttpGet("invoices/{invoiceId:guid}/workflow")]
    [Authorize(Roles = "Admin,Dealer")]
    [ProducesResponseType(typeof(InvoiceWorkflowStateDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetInvoiceWorkflow(Guid invoiceId, CancellationToken cancellationToken)
    {
        var workflow = await paymentInvoiceService.GetInvoiceWorkflowAsync(invoiceId, cancellationToken);
        return workflow is null ? NotFound() : Ok(workflow);
    }

    [HttpGet("dealers/{dealerId:guid}/invoice-workflows")]
    [Authorize(Roles = "Admin,Dealer")]
    [ProducesResponseType(typeof(IReadOnlyList<InvoiceWorkflowStateDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetDealerInvoiceWorkflows(Guid dealerId, CancellationToken cancellationToken)
    {
        var workflows = await paymentInvoiceService.GetDealerInvoiceWorkflowsAsync(dealerId, cancellationToken);
        return Ok(workflows);
    }

    [HttpPut("invoices/{invoiceId:guid}/workflow")]
    [Authorize(Roles = "Admin,Dealer")]
    [ProducesResponseType(typeof(InvoiceWorkflowStateDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpsertInvoiceWorkflow(Guid invoiceId, [FromBody] UpsertInvoiceWorkflowRequest request, CancellationToken cancellationToken)
    {
        var workflow = await paymentInvoiceService.UpsertInvoiceWorkflowAsync(invoiceId, request, cancellationToken);
        return workflow is null ? NotFound() : Ok(workflow);
    }

    [HttpGet("invoices/{invoiceId:guid}/workflow-activities")]
    [Authorize(Roles = "Admin,Dealer")]
    [ProducesResponseType(typeof(IReadOnlyList<InvoiceWorkflowActivityDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetInvoiceWorkflowActivities(Guid invoiceId, CancellationToken cancellationToken)
    {
        var activities = await paymentInvoiceService.GetInvoiceWorkflowActivitiesAsync(invoiceId, cancellationToken);
        return Ok(activities);
    }

    [HttpPost("invoices/{invoiceId:guid}/workflow-activities")]
    [Authorize(Roles = "Admin,Dealer")]
    [ProducesResponseType(typeof(InvoiceWorkflowActivityDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> AddInvoiceWorkflowActivity(Guid invoiceId, [FromBody] AddInvoiceWorkflowActivityRequest request, CancellationToken cancellationToken)
    {
        var activity = await paymentInvoiceService.AddInvoiceWorkflowActivityAsync(invoiceId, request, cancellationToken);
        return activity is null ? NotFound() : Ok(activity);
    }

    [HttpGet("invoices/{invoiceId:guid}/download")]
    [Authorize(Roles = "Admin,Dealer")]
    public async Task<IActionResult> DownloadInvoice(Guid invoiceId, CancellationToken cancellationToken)
    {
        var pdfPath = await paymentInvoiceService.GetInvoicePdfPathAsync(invoiceId, cancellationToken);
        if (string.IsNullOrWhiteSpace(pdfPath) || !System.IO.File.Exists(pdfPath))
        {
            return NotFound(new { message = "Invoice PDF not found." });
        }

        var fileName = Path.GetFileName(pdfPath);
        return PhysicalFile(pdfPath, "application/pdf", fileName);
    }

    private bool TryGetUserId(out Guid userId)
    {
        var sub = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(sub, out userId);
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
}
