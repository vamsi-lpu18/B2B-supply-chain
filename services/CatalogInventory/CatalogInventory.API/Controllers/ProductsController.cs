using CatalogInventory.Application.DTOs;
using CatalogInventory.Application.Features.Catalog;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace CatalogInventory.API.Controllers;

[ApiController]
[Route("api/products")]
public sealed class ProductsController(ISender sender) : ControllerBase
{
    [HttpPost]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(ProductDto), StatusCodes.Status201Created)]
    public async Task<IActionResult> Create([FromBody] CreateProductRequest request, CancellationToken cancellationToken)
    {
        var created = await sender.Send(new CreateProductCommand(request), cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = created.ProductId }, created);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(ProductDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateProductRequest request, CancellationToken cancellationToken)
    {
        var updated = await sender.Send(new UpdateProductCommand(id, request), cancellationToken);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpPut("{id:guid}/deactivate")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Deactivate(Guid id, CancellationToken cancellationToken)
    {
        var deactivated = await sender.Send(new DeactivateProductCommand(id), cancellationToken);
        return deactivated ? Ok(new { message = "Product deactivated." }) : NotFound();
    }

    [HttpPost("{id:guid}/restock")]
    [Authorize(Roles = "Admin,Warehouse")]
    public async Task<IActionResult> Restock(Guid id, [FromBody] RestockProductRequest request, CancellationToken cancellationToken)
    {
        var restocked = await sender.Send(new RestockProductCommand(id, request), cancellationToken);
        return restocked ? Ok(new { message = "Product restocked." }) : NotFound();
    }

    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(PagedResult<ProductListItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPage([FromQuery] int page = 1, [FromQuery] int size = 20, [FromQuery] bool includeInactive = false, CancellationToken cancellationToken = default)
    {
        var allowInactive = includeInactive && (User.IsInRole("Admin") || User.IsInRole("Warehouse"));
        var result = await sender.Send(new GetProductListQuery(page, size, allowInactive), cancellationToken);
        return Ok(result);
    }

    [HttpGet("categories")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<CategoryDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCategories(CancellationToken cancellationToken)
    {
        var categories = await sender.Send(new GetCategoriesQuery(), cancellationToken);
        return Ok(categories);
    }

    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ProductDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        var product = await sender.Send(new GetProductDetailQuery(id), cancellationToken);
        return product is null ? NotFound() : Ok(product);
    }

    [HttpGet("search")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<ProductListItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Search([FromQuery] string q, [FromQuery] bool includeInactive = false, CancellationToken cancellationToken = default)
    {
        var allowInactive = includeInactive && (User.IsInRole("Admin") || User.IsInRole("Warehouse"));
        var results = await sender.Send(new SearchProductsQuery(q, allowInactive), cancellationToken);
        return Ok(results);
    }

    [HttpGet("{id:guid}/stock")]
    [Authorize(Roles = "Admin,Warehouse")]
    [ProducesResponseType(typeof(StockLevelDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetStock(Guid id, CancellationToken cancellationToken)
    {
        var stock = await sender.Send(new GetStockLevelQuery(id), cancellationToken);
        return stock is null ? NotFound() : Ok(stock);
    }

    [HttpGet("{id:guid}/reviews")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<ProductReviewDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetReviews(Guid id, [FromQuery] bool includePending = false, CancellationToken cancellationToken = default)
    {
        var allowPending = includePending && User.IsInRole("Admin");
        var reviews = await sender.Send(new GetProductReviewsQuery(id, allowPending), cancellationToken);
        return Ok(reviews);
    }

    [HttpPost("{id:guid}/reviews")]
    [Authorize(Roles = "Dealer")]
    [ProducesResponseType(typeof(ProductReviewDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> AddReview(Guid id, [FromBody] CreateProductReviewRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var dealerId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var review = await sender.Send(new CreateProductReviewCommand(id, dealerId, request), cancellationToken);
        return review is null
            ? NotFound()
            : CreatedAtAction(nameof(GetReviews), new { id, includePending = false }, review);
    }

    [HttpPut("reviews/{reviewId:guid}/approve")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(ProductReviewDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ApproveReview(Guid reviewId, [FromBody] ModerateProductReviewRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var adminUserId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var review = await sender.Send(new ApproveProductReviewCommand(reviewId, adminUserId, request.Note), cancellationToken);
        return review is null ? NotFound() : Ok(review);
    }

    [HttpPut("reviews/{reviewId:guid}/reject")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(ProductReviewDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> RejectReview(Guid reviewId, [FromBody] ModerateProductReviewRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var adminUserId))
        {
            return Unauthorized(new { message = "Invalid token." });
        }

        var review = await sender.Send(new RejectProductReviewCommand(reviewId, adminUserId, request.Note), cancellationToken);
        return review is null ? NotFound() : Ok(review);
    }

    private bool TryGetUserId(out Guid userId)
    {
        var sub = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(sub, out userId);
    }
}
