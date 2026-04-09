using CatalogInventory.Application.Abstractions;
using CatalogInventory.Application.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CatalogInventory.API.Controllers;

[ApiController]
[Route("api/products")]
public sealed class ProductsController(ICatalogInventoryService catalogService) : ControllerBase
{
    [HttpPost]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(ProductDto), StatusCodes.Status201Created)]
    public async Task<IActionResult> Create([FromBody] CreateProductRequest request, CancellationToken cancellationToken)
    {
        var created = await catalogService.CreateProductAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = created.ProductId }, created);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(ProductDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateProductRequest request, CancellationToken cancellationToken)
    {
        var updated = await catalogService.UpdateProductAsync(id, request, cancellationToken);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpPut("{id:guid}/deactivate")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Deactivate(Guid id, CancellationToken cancellationToken)
    {
        var deactivated = await catalogService.DeactivateProductAsync(id, cancellationToken);
        return deactivated ? Ok(new { message = "Product deactivated." }) : NotFound();
    }

    [HttpPost("{id:guid}/restock")]
    [Authorize(Roles = "Admin,Warehouse")]
    public async Task<IActionResult> Restock(Guid id, [FromBody] RestockProductRequest request, CancellationToken cancellationToken)
    {
        var restocked = await catalogService.RestockProductAsync(id, request, cancellationToken);
        return restocked ? Ok(new { message = "Product restocked." }) : NotFound();
    }

    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(PagedResult<ProductListItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPage([FromQuery] int page = 1, [FromQuery] int size = 20, [FromQuery] bool includeInactive = false, CancellationToken cancellationToken = default)
    {
        var allowInactive = includeInactive && (User.IsInRole("Admin") || User.IsInRole("Warehouse"));
        var result = await catalogService.GetProductListAsync(page, size, allowInactive, cancellationToken);
        return Ok(result);
    }

    [HttpGet("categories")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<CategoryDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCategories(CancellationToken cancellationToken)
    {
        var categories = await catalogService.GetCategoriesAsync(cancellationToken);
        return Ok(categories);
    }

    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ProductDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        var product = await catalogService.GetProductDetailAsync(id, cancellationToken);
        return product is null ? NotFound() : Ok(product);
    }

    [HttpGet("search")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<ProductListItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Search([FromQuery] string q, [FromQuery] bool includeInactive = false, CancellationToken cancellationToken = default)
    {
        var allowInactive = includeInactive && (User.IsInRole("Admin") || User.IsInRole("Warehouse"));
        var results = await catalogService.SearchProductsAsync(q, allowInactive, cancellationToken);
        return Ok(results);
    }

    [HttpGet("{id:guid}/stock")]
    [Authorize(Roles = "Admin,Warehouse")]
    [ProducesResponseType(typeof(StockLevelDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetStock(Guid id, CancellationToken cancellationToken)
    {
        var stock = await catalogService.GetStockLevelAsync(id, cancellationToken);
        return stock is null ? NotFound() : Ok(stock);
    }
}
