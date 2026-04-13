using FluentValidation;
using IdentityAuth.Application.DTOs;

namespace IdentityAuth.Application.Validation;

public sealed class RegisterDealerRequestValidator : AbstractValidator<RegisterDealerRequest>
{
    public RegisterDealerRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password)
            .NotEmpty()
            .MinimumLength(8)
            .Matches("[A-Z]")
            .WithMessage("Password must contain at least one uppercase letter.")
            .Matches("[0-9]")
            .WithMessage("Password must contain at least one number.");
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(120);
        RuleFor(x => x.PhoneNumber)
            .NotEmpty()
            .Matches("^[6-9][0-9]{9}$")
            .WithMessage("Phone number must be a valid 10-digit Indian mobile number.");
        RuleFor(x => x.GstNumber)
            .NotEmpty()
            .Matches("^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
            .WithMessage("GST number format is invalid.");
        RuleFor(x => x.BusinessName).NotEmpty().MaximumLength(180);
        RuleFor(x => x.TradeLicenseNo).NotEmpty().MaximumLength(80);
        RuleFor(x => x.Address).NotEmpty().MaximumLength(300);
        RuleFor(x => x.City).NotEmpty().MaximumLength(100);
        RuleFor(x => x.State).NotEmpty().MaximumLength(100);
        RuleFor(x => x.PinCode)
            .NotEmpty()
            .Matches("^[0-9]{6}$")
            .WithMessage("Pin code must be 6 digits.");
    }
}

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password).NotEmpty();
    }
}

public sealed class CreateAgentRequestValidator : AbstractValidator<CreateAgentRequest>
{
    public CreateAgentRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.TemporaryPassword)
            .NotEmpty()
            .MinimumLength(8)
            .Matches("[A-Z]")
            .WithMessage("Password must contain at least one uppercase letter.")
            .Matches("[0-9]")
            .WithMessage("Password must contain at least one number.");
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(120);
        RuleFor(x => x.PhoneNumber)
            .NotEmpty()
            .Matches("^[6-9][0-9]{9}$")
            .WithMessage("Phone number must be a valid 10-digit Indian mobile number.");
    }
}

public sealed class ResetPasswordRequestValidator : AbstractValidator<ResetPasswordRequest>
{
    public ResetPasswordRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.OtpCode)
            .NotEmpty()
            .Matches("^[0-9]{6}$")
            .WithMessage("OTP must be a 6-digit code.");
        RuleFor(x => x.NewPassword)
            .NotEmpty()
            .MinimumLength(8)
            .Matches("[A-Z]")
            .WithMessage("Password must contain at least one uppercase letter.")
            .Matches("[0-9]")
            .WithMessage("Password must contain at least one number.");
    }
}

public sealed class ChangePasswordRequestValidator : AbstractValidator<ChangePasswordRequest>
{
    public ChangePasswordRequestValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty();
        RuleFor(x => x.NewPassword)
            .NotEmpty()
            .MinimumLength(8)
            .Matches("[A-Z]")
            .WithMessage("Password must contain at least one uppercase letter.")
            .Matches("[0-9]")
            .WithMessage("Password must contain at least one number.");
    }
}

public sealed class RejectDealerRequestValidator : AbstractValidator<RejectDealerRequest>
{
    public RejectDealerRequestValidator()
    {
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(400);
    }
}

public sealed class UpdateCreditLimitRequestValidator : AbstractValidator<UpdateCreditLimitRequest>
{
    public UpdateCreditLimitRequestValidator()
    {
        RuleFor(x => x.CreditLimit).GreaterThanOrEqualTo(0m);
    }
}
