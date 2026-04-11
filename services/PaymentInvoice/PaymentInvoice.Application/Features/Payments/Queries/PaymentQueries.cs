using MediatR;
using PaymentInvoice.Application.Abstractions;
using PaymentInvoice.Application.DTOs;

namespace PaymentInvoice.Application.Features.Payments;

public sealed record CheckCreditQuery(Guid DealerId, decimal Amount) : IRequest<CreditCheckResponse>;

public sealed class CheckCreditQueryHandler(IPaymentInvoiceService service)
    : IRequestHandler<CheckCreditQuery, CreditCheckResponse>
{
    public Task<CreditCheckResponse> Handle(CheckCreditQuery request, CancellationToken cancellationToken)
        => service.CheckCreditAsync(request.DealerId, request.Amount, cancellationToken);
}

public sealed record GetInvoiceQuery(Guid InvoiceId) : IRequest<InvoiceDto?>;

public sealed class GetInvoiceQueryHandler(IPaymentInvoiceService service)
    : IRequestHandler<GetInvoiceQuery, InvoiceDto?>
{
    public Task<InvoiceDto?> Handle(GetInvoiceQuery request, CancellationToken cancellationToken)
        => service.GetInvoiceAsync(request.InvoiceId, cancellationToken);
}

public sealed record GetDealerInvoicesQuery(Guid DealerId) : IRequest<IReadOnlyList<InvoiceDto>>;

public sealed class GetDealerInvoicesQueryHandler(IPaymentInvoiceService service)
    : IRequestHandler<GetDealerInvoicesQuery, IReadOnlyList<InvoiceDto>>
{
    public Task<IReadOnlyList<InvoiceDto>> Handle(GetDealerInvoicesQuery request, CancellationToken cancellationToken)
        => service.GetDealerInvoicesAsync(request.DealerId, cancellationToken);
}

public sealed record GetInvoicePdfPathQuery(Guid InvoiceId) : IRequest<string?>;

public sealed class GetInvoicePdfPathQueryHandler(IPaymentInvoiceService service)
    : IRequestHandler<GetInvoicePdfPathQuery, string?>
{
    public Task<string?> Handle(GetInvoicePdfPathQuery request, CancellationToken cancellationToken)
        => service.GetInvoicePdfPathAsync(request.InvoiceId, cancellationToken);
}

public sealed record GetInvoiceWorkflowQuery(Guid InvoiceId) : IRequest<InvoiceWorkflowStateDto?>;

public sealed class GetInvoiceWorkflowQueryHandler(IPaymentInvoiceService service)
    : IRequestHandler<GetInvoiceWorkflowQuery, InvoiceWorkflowStateDto?>
{
    public Task<InvoiceWorkflowStateDto?> Handle(GetInvoiceWorkflowQuery request, CancellationToken cancellationToken)
        => service.GetInvoiceWorkflowAsync(request.InvoiceId, cancellationToken);
}

public sealed record GetDealerInvoiceWorkflowsQuery(Guid DealerId)
    : IRequest<IReadOnlyList<InvoiceWorkflowStateDto>>;

public sealed class GetDealerInvoiceWorkflowsQueryHandler(IPaymentInvoiceService service)
    : IRequestHandler<GetDealerInvoiceWorkflowsQuery, IReadOnlyList<InvoiceWorkflowStateDto>>
{
    public Task<IReadOnlyList<InvoiceWorkflowStateDto>> Handle(GetDealerInvoiceWorkflowsQuery request, CancellationToken cancellationToken)
        => service.GetDealerInvoiceWorkflowsAsync(request.DealerId, cancellationToken);
}

public sealed record GetInvoiceWorkflowActivitiesQuery(Guid InvoiceId)
    : IRequest<IReadOnlyList<InvoiceWorkflowActivityDto>>;

public sealed class GetInvoiceWorkflowActivitiesQueryHandler(IPaymentInvoiceService service)
    : IRequestHandler<GetInvoiceWorkflowActivitiesQuery, IReadOnlyList<InvoiceWorkflowActivityDto>>
{
    public Task<IReadOnlyList<InvoiceWorkflowActivityDto>> Handle(GetInvoiceWorkflowActivitiesQuery request, CancellationToken cancellationToken)
        => service.GetInvoiceWorkflowActivitiesAsync(request.InvoiceId, cancellationToken);
}
