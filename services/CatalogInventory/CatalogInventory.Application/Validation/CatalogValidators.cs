using CatalogInventory.Application.DTOs;
using FluentValidation;

namespace CatalogInventory.Application.Validation;

public sealed class CreateProductRequestValidator : AbstractValidator<CreateProductRequest>
{
    public CreateProductRequestValidator()
    {
        RuleFor(x => x.Sku)
            .NotEmpty()
            .MaximumLength(60)
            .Matches("^[A-Za-z0-9-_]+$")
            .WithMessage("SKU must contain only letters, numbers, hyphen, or underscore.");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).NotEmpty().MaximumLength(2000);
        RuleFor(x => x.CategoryId).NotEmpty();
        RuleFor(x => x.UnitPrice).GreaterThan(0m);
        RuleFor(x => x.MinOrderQty).GreaterThan(0);
        RuleFor(x => x.OpeningStock).GreaterThanOrEqualTo(0);
        RuleFor(x => x.ImageUrl)
            .MaximumLength(500)
            .Must(BeValidHttpUrl)
            .WithMessage("Image URL must be a valid absolute http or https URL.")
            .When(x => !string.IsNullOrWhiteSpace(x.ImageUrl));
    }

    private static bool BeValidHttpUrl(string? imageUrl)
    {
        if (string.IsNullOrWhiteSpace(imageUrl))
        {
            return true;
        }

        return Uri.TryCreate(imageUrl, UriKind.Absolute, out var uri)
               && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
    }
}

public sealed class UpdateProductRequestValidator : AbstractValidator<UpdateProductRequest>
{
    public UpdateProductRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).NotEmpty().MaximumLength(2000);
        RuleFor(x => x.CategoryId).NotEmpty();
        RuleFor(x => x.UnitPrice).GreaterThan(0m);
        RuleFor(x => x.MinOrderQty).GreaterThan(0);
        RuleFor(x => x.ImageUrl)
            .MaximumLength(500)
            .Must(BeValidHttpUrl)
            .WithMessage("Image URL must be a valid absolute http or https URL.")
            .When(x => !string.IsNullOrWhiteSpace(x.ImageUrl));
    }

    private static bool BeValidHttpUrl(string? imageUrl)
    {
        if (string.IsNullOrWhiteSpace(imageUrl))
        {
            return true;
        }

        return Uri.TryCreate(imageUrl, UriKind.Absolute, out var uri)
               && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
    }
}

public sealed class RestockProductRequestValidator : AbstractValidator<RestockProductRequest>
{
    public RestockProductRequestValidator()
    {
        RuleFor(x => x.Quantity).GreaterThan(0);
        RuleFor(x => x.ReferenceId).NotEmpty().MaximumLength(120);
    }
}

public sealed class SoftLockStockRequestValidator : AbstractValidator<SoftLockStockRequest>
{
    public SoftLockStockRequestValidator()
    {
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.Quantity).GreaterThan(0);
    }
}

public sealed class HardDeductStockRequestValidator : AbstractValidator<HardDeductStockRequest>
{
    public HardDeductStockRequestValidator()
    {
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.Quantity).GreaterThan(0);
    }
}

public sealed class StockSubscriptionRequestValidator : AbstractValidator<StockSubscriptionRequest>
{
    public StockSubscriptionRequestValidator()
    {
        RuleFor(x => x.DealerId).NotEmpty();
        RuleFor(x => x.ProductId).NotEmpty();
    }
}
