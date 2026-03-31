using FluentValidation;
using Notification.Application.DTOs;

namespace Notification.Application.Validation;

public sealed class CreateManualNotificationRequestValidator : AbstractValidator<CreateManualNotificationRequest>
{
    public CreateManualNotificationRequestValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(180);
        RuleFor(x => x.Body).NotEmpty().MaximumLength(4000);
    }
}

public sealed class IngestIntegrationEventRequestValidator : AbstractValidator<IngestIntegrationEventRequest>
{
    public IngestIntegrationEventRequestValidator()
    {
        RuleFor(x => x.SourceService).NotEmpty().MaximumLength(100);
        RuleFor(x => x.EventType).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Payload).NotEmpty();
    }
}

public sealed class MarkNotificationFailedRequestValidator : AbstractValidator<MarkNotificationFailedRequest>
{
    public MarkNotificationFailedRequestValidator()
    {
        RuleFor(x => x.FailureReason).NotEmpty().MaximumLength(1000);
    }
}
