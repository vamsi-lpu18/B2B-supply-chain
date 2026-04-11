using MediatR;
using PaymentInvoice.Application.Abstractions;
using PaymentInvoice.Application.DTOs;

namespace PaymentInvoice.Application.Features.Payments;

public sealed record EnsureDealerAccountCommand(Guid DealerId, decimal? InitialLimit)
    : IRequest<DealerCreditAccountDto>;

public sealed class EnsureDealerAccountCommandHandler(IPaymentInvoiceService service)
    : IRequestHandler<EnsureDealerAccountCommand, DealerCreditAccountDto>
{
    public Task<DealerCreditAccountDto> Handle(EnsureDealerAccountCommand request, CancellationToken cancellationToken)
        => service.EnsureDealerAccountAsync(request.DealerId, request.InitialLimit, cancellationToken);
}

public sealed record UpdateCreditLimitCommand(Guid DealerId, decimal CreditLimit)
    : IRequest<DealerCreditAccountDto?>;

public sealed class UpdateCreditLimitCommandHandler(IPaymentInvoiceService service)
    : IRequestHandler<UpdateCreditLimitCommand, DealerCreditAccountDto?>
{
    public Task<DealerCreditAccountDto?> Handle(UpdateCreditLimitCommand request, CancellationToken cancellationToken)
        => service.UpdateCreditLimitAsync(request.DealerId, request.CreditLimit, cancellationToken);
}

public sealed record GenerateInvoiceCommand(GenerateInvoiceRequest Request) : IRequest<InvoiceDto>;

public sealed class GenerateInvoiceCommandHandler(IPaymentInvoiceService service)
    : IRequestHandler<GenerateInvoiceCommand, InvoiceDto>
{
    public Task<InvoiceDto> Handle(GenerateInvoiceCommand request, CancellationToken cancellationToken)
        => service.GenerateInvoiceAsync(request.Request, cancellationToken);
}

public sealed record SettleOutstandingCommand(Guid DealerId, decimal Amount, string? ReferenceNo)
    : IRequest<DealerCreditAccountDto?>;

public sealed class SettleOutstandingCommandHandler(IPaymentInvoiceService service)
    : IRequestHandler<SettleOutstandingCommand, DealerCreditAccountDto?>
{
    public Task<DealerCreditAccountDto?> Handle(SettleOutstandingCommand request, CancellationToken cancellationToken)
        => service.SettleOutstandingAsync(request.DealerId, request.Amount, request.ReferenceNo, cancellationToken);
}

public sealed record CreateGatewayOrderCommand(Guid DealerId, CreateGatewayOrderRequest Request)
    : IRequest<GatewayOrderDto>;

public sealed class CreateGatewayOrderCommandHandler(IPaymentInvoiceService service)
    : IRequestHandler<CreateGatewayOrderCommand, GatewayOrderDto>
{
    public Task<GatewayOrderDto> Handle(CreateGatewayOrderCommand request, CancellationToken cancellationToken)
        => service.CreateGatewayOrderAsync(request.DealerId, request.Request, cancellationToken);
}

public sealed record VerifyGatewayPaymentCommand(Guid DealerId, VerifyGatewayPaymentRequest Request)
    : IRequest<GatewayPaymentVerificationDto>;

public sealed class VerifyGatewayPaymentCommandHandler(IPaymentInvoiceService service)
    : IRequestHandler<VerifyGatewayPaymentCommand, GatewayPaymentVerificationDto>
{
    public Task<GatewayPaymentVerificationDto> Handle(VerifyGatewayPaymentCommand request, CancellationToken cancellationToken)
        => service.VerifyGatewayPaymentAsync(request.DealerId, request.Request, cancellationToken);
}

public sealed record UpsertInvoiceWorkflowCommand(Guid InvoiceId, UpsertInvoiceWorkflowRequest Request)
    : IRequest<InvoiceWorkflowStateDto?>;

public sealed class UpsertInvoiceWorkflowCommandHandler(IPaymentInvoiceService service)
    : IRequestHandler<UpsertInvoiceWorkflowCommand, InvoiceWorkflowStateDto?>
{
    public Task<InvoiceWorkflowStateDto?> Handle(UpsertInvoiceWorkflowCommand request, CancellationToken cancellationToken)
        => service.UpsertInvoiceWorkflowAsync(request.InvoiceId, request.Request, cancellationToken);
}

public sealed record AddInvoiceWorkflowActivityCommand(Guid InvoiceId, AddInvoiceWorkflowActivityRequest Request)
    : IRequest<InvoiceWorkflowActivityDto?>;

public sealed class AddInvoiceWorkflowActivityCommandHandler(IPaymentInvoiceService service)
    : IRequestHandler<AddInvoiceWorkflowActivityCommand, InvoiceWorkflowActivityDto?>
{
    public Task<InvoiceWorkflowActivityDto?> Handle(AddInvoiceWorkflowActivityCommand request, CancellationToken cancellationToken)
        => service.AddInvoiceWorkflowActivityAsync(request.InvoiceId, request.Request, cancellationToken);
}
