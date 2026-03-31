using FluentValidation;
using Order.Application.DTOs;

namespace Order.Application.Validation;

public sealed class CreateOrderRequestValidator : AbstractValidator<CreateOrderRequest>
{
    public CreateOrderRequestValidator()
    {
        RuleFor(x => x.PaymentMode).IsInEnum();
        RuleFor(x => x.Lines).NotNull().NotEmpty();

        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.ProductId).NotEmpty();
            line.RuleFor(l => l.ProductName).NotEmpty().MaximumLength(220);
            line.RuleFor(l => l.Sku).NotEmpty().MaximumLength(60);
            line.RuleFor(l => l.Quantity).GreaterThan(0);
            line.RuleFor(l => l.UnitPrice).GreaterThan(0m);
            line.RuleFor(l => l.MinOrderQty).GreaterThan(0);
        });
    }
}

public sealed class CancelOrderRequestValidator : AbstractValidator<CancelOrderRequest>
{
    public CancelOrderRequestValidator()
    {
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(400);
    }
}

public sealed class UpdateOrderStatusRequestValidator : AbstractValidator<UpdateOrderStatusRequest>
{
    public UpdateOrderStatusRequestValidator()
    {
        RuleFor(x => x.NewStatus).IsInEnum();
    }
}

public sealed class ReturnRequestValidator : AbstractValidator<ReturnRequestDto>
{
    public ReturnRequestValidator()
    {
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(500);
    }
}

public sealed class AdminDecisionRequestValidator : AbstractValidator<AdminDecisionRequest>
{
    public AdminDecisionRequestValidator()
    {
        RuleFor(x => x.Reason).MaximumLength(400).When(x => !string.IsNullOrWhiteSpace(x.Reason));
    }
}
