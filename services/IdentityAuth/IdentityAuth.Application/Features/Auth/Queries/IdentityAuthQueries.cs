using IdentityAuth.Application.Abstractions;
using IdentityAuth.Application.DTOs;
using MediatR;

namespace IdentityAuth.Application.Features.Auth;

public sealed record GetAgentsQuery(int Page, int PageSize, string? Search)
    : IRequest<PagedResult<AgentSummaryDto>>;

public sealed class GetAgentsQueryHandler(IIdentityAuthService service)
    : IRequestHandler<GetAgentsQuery, PagedResult<AgentSummaryDto>>
{
    public Task<PagedResult<AgentSummaryDto>> Handle(GetAgentsQuery request, CancellationToken cancellationToken)
        => service.GetAgentsAsync(request.Page, request.PageSize, request.Search, cancellationToken);
}

public sealed record GetDealersQuery(int Page, int PageSize, string? Search)
    : IRequest<PagedResult<DealerSummaryDto>>;

public sealed class GetDealersQueryHandler(IIdentityAuthService service)
    : IRequestHandler<GetDealersQuery, PagedResult<DealerSummaryDto>>
{
    public Task<PagedResult<DealerSummaryDto>> Handle(GetDealersQuery request, CancellationToken cancellationToken)
        => service.GetDealersAsync(request.Page, request.PageSize, request.Search, cancellationToken);
}

public sealed record GetDealerByIdQuery(Guid DealerId) : IRequest<DealerDetailDto?>;

public sealed class GetDealerByIdQueryHandler(IIdentityAuthService service)
    : IRequestHandler<GetDealerByIdQuery, DealerDetailDto?>
{
    public Task<DealerDetailDto?> Handle(GetDealerByIdQuery request, CancellationToken cancellationToken)
        => service.GetDealerAsync(request.DealerId, cancellationToken);
}

public sealed record GetProfileQuery(Guid UserId) : IRequest<UserProfileDto?>;

public sealed class GetProfileQueryHandler(IIdentityAuthService service)
    : IRequestHandler<GetProfileQuery, UserProfileDto?>
{
    public Task<UserProfileDto?> Handle(GetProfileQuery request, CancellationToken cancellationToken)
        => service.GetProfileAsync(request.UserId, cancellationToken);
}

public sealed record GetInternalUserContactQuery(Guid UserId) : IRequest<InternalUserContactDto?>;

public sealed class GetInternalUserContactQueryHandler(IIdentityAuthService service)
    : IRequestHandler<GetInternalUserContactQuery, InternalUserContactDto?>
{
    public Task<InternalUserContactDto?> Handle(GetInternalUserContactQuery request, CancellationToken cancellationToken)
        => service.GetInternalUserContactAsync(request.UserId, cancellationToken);
}
