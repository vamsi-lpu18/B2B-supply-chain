using FluentValidation;
using LogisticsTracking.Application.DTOs;

namespace LogisticsTracking.Application.Validation;

public sealed class CreateShipmentRequestValidator : AbstractValidator<CreateShipmentRequest>
{
    public CreateShipmentRequestValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.DealerId).NotEmpty();
        RuleFor(x => x.DeliveryAddress).NotEmpty().MaximumLength(500);
        RuleFor(x => x.City).NotEmpty().MaximumLength(100);
        RuleFor(x => x.State).NotEmpty().MaximumLength(100);
        RuleFor(x => x.PostalCode).NotEmpty().MaximumLength(12);
    }
}

public sealed class AssignAgentRequestValidator : AbstractValidator<AssignAgentRequest>
{
    public AssignAgentRequestValidator()
    {
        RuleFor(x => x.AgentId).NotEmpty();
    }
}

public sealed class AssignVehicleRequestValidator : AbstractValidator<AssignVehicleRequest>
{
    public AssignVehicleRequestValidator()
    {
        RuleFor(x => x.VehicleNumber)
            .NotEmpty()
            .MinimumLength(5)
            .MaximumLength(32);

        RuleFor(x => x.VehicleNumber)
            .Matches("^[A-Za-z0-9][A-Za-z0-9\\- ]{4,31}$")
            .WithMessage("Vehicle number can contain only letters, numbers, spaces, and hyphens.");
    }
}

public sealed class UpdateShipmentStatusRequestValidator : AbstractValidator<UpdateShipmentStatusRequest>
{
    public UpdateShipmentStatusRequestValidator()
    {
        RuleFor(x => x.Note).NotEmpty().MaximumLength(500);
    }
}
