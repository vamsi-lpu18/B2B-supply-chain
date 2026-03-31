using FluentValidation;
using PaymentInvoice.Application.DTOs;

namespace PaymentInvoice.Application.Validation;

public sealed class UpdateCreditLimitRequestValidator : AbstractValidator<UpdateCreditLimitRequest>
{
    public UpdateCreditLimitRequestValidator()
    {
        RuleFor(x => x.CreditLimit).GreaterThanOrEqualTo(0m);
    }
}

public sealed class GenerateInvoiceRequestValidator : AbstractValidator<GenerateInvoiceRequest>
{
    public GenerateInvoiceRequestValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.DealerId).NotEmpty();
        RuleFor(x => x.Lines).NotNull().NotEmpty();

        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.ProductId).NotEmpty();
            line.RuleFor(l => l.ProductName).NotEmpty().MaximumLength(220);
            line.RuleFor(l => l.Sku).NotEmpty().MaximumLength(60);
            line.RuleFor(l => l.HsnCode).NotEmpty().MaximumLength(20);
            line.RuleFor(l => l.Quantity).GreaterThan(0);
            line.RuleFor(l => l.UnitPrice).GreaterThan(0m);
        });
    }
}

public sealed class SettleOutstandingRequestValidator : AbstractValidator<SettleOutstandingRequest>
{
    public SettleOutstandingRequestValidator()
    {
        RuleFor(x => x.Amount).GreaterThan(0m);
        RuleFor(x => x.ReferenceNo).MaximumLength(100).When(x => !string.IsNullOrWhiteSpace(x.ReferenceNo));
    }
}

public sealed class CreateGatewayOrderRequestValidator : AbstractValidator<CreateGatewayOrderRequest>
{
    public CreateGatewayOrderRequestValidator()
    {
        RuleFor(x => x.Amount).GreaterThan(0m);
        RuleFor(x => x.Currency).MaximumLength(10).When(x => !string.IsNullOrWhiteSpace(x.Currency));
        RuleFor(x => x.Description).MaximumLength(200).When(x => !string.IsNullOrWhiteSpace(x.Description));
        RuleFor(x => x.Receipt).MaximumLength(80).When(x => !string.IsNullOrWhiteSpace(x.Receipt));
    }
}

public sealed class VerifyGatewayPaymentRequestValidator : AbstractValidator<VerifyGatewayPaymentRequest>
{
    public VerifyGatewayPaymentRequestValidator()
    {
        RuleFor(x => x.GatewayOrderId).NotEmpty().MaximumLength(80);
        RuleFor(x => x.GatewayPaymentId).NotEmpty().MaximumLength(80);
        RuleFor(x => x.Signature).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Amount).GreaterThan(0m);
        RuleFor(x => x.Currency).MaximumLength(10).When(x => !string.IsNullOrWhiteSpace(x.Currency));
        RuleFor(x => x.Receipt).MaximumLength(80).When(x => !string.IsNullOrWhiteSpace(x.Receipt));
        RuleFor(x => x.Description).MaximumLength(200).When(x => !string.IsNullOrWhiteSpace(x.Description));
    }
}
