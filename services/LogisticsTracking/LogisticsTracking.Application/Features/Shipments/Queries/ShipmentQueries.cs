using LogisticsTracking.Application.Abstractions;
using LogisticsTracking.Application.DTOs;
using MediatR;

namespace LogisticsTracking.Application.Features.Shipments;

public sealed record GetShipmentQuery(Guid ShipmentId) : IRequest<ShipmentDto?>;

public sealed class GetShipmentQueryHandler(ILogisticsService service)
    : IRequestHandler<GetShipmentQuery, ShipmentDto?>
{
    public Task<ShipmentDto?> Handle(GetShipmentQuery request, CancellationToken cancellationToken)
        => service.GetShipmentAsync(request.ShipmentId, cancellationToken);
}

public sealed record GetDealerShipmentsQuery(Guid DealerId) : IRequest<IReadOnlyList<ShipmentDto>>;

public sealed class GetDealerShipmentsQueryHandler(ILogisticsService service)
    : IRequestHandler<GetDealerShipmentsQuery, IReadOnlyList<ShipmentDto>>
{
    public Task<IReadOnlyList<ShipmentDto>> Handle(GetDealerShipmentsQuery request, CancellationToken cancellationToken)
        => service.GetDealerShipmentsAsync(request.DealerId, cancellationToken);
}

public sealed record GetAgentShipmentsQuery(Guid AgentId) : IRequest<IReadOnlyList<ShipmentDto>>;

public sealed class GetAgentShipmentsQueryHandler(ILogisticsService service)
    : IRequestHandler<GetAgentShipmentsQuery, IReadOnlyList<ShipmentDto>>
{
    public Task<IReadOnlyList<ShipmentDto>> Handle(GetAgentShipmentsQuery request, CancellationToken cancellationToken)
        => service.GetAgentShipmentsAsync(request.AgentId, cancellationToken);
}

public sealed record GetAllShipmentsQuery : IRequest<IReadOnlyList<ShipmentDto>>;

public sealed class GetAllShipmentsQueryHandler(ILogisticsService service)
    : IRequestHandler<GetAllShipmentsQuery, IReadOnlyList<ShipmentDto>>
{
    public Task<IReadOnlyList<ShipmentDto>> Handle(GetAllShipmentsQuery request, CancellationToken cancellationToken)
        => service.GetAllShipmentsAsync(cancellationToken);
}

public sealed record GetShipmentOpsStateQuery(Guid ShipmentId) : IRequest<ShipmentOpsStateDto?>;

public sealed class GetShipmentOpsStateQueryHandler(ILogisticsService service)
    : IRequestHandler<GetShipmentOpsStateQuery, ShipmentOpsStateDto?>
{
    public Task<ShipmentOpsStateDto?> Handle(GetShipmentOpsStateQuery request, CancellationToken cancellationToken)
        => service.GetShipmentOpsStateAsync(request.ShipmentId, cancellationToken);
}

public sealed record GetShipmentOpsStatesQuery(GetShipmentOpsStatesRequest Request)
    : IRequest<IReadOnlyList<ShipmentOpsStateDto>>;

public sealed class GetShipmentOpsStatesQueryHandler(ILogisticsService service)
    : IRequestHandler<GetShipmentOpsStatesQuery, IReadOnlyList<ShipmentOpsStateDto>>
{
    public Task<IReadOnlyList<ShipmentOpsStateDto>> Handle(GetShipmentOpsStatesQuery request, CancellationToken cancellationToken)
        => service.GetShipmentOpsStatesAsync(request.Request, cancellationToken);
}
