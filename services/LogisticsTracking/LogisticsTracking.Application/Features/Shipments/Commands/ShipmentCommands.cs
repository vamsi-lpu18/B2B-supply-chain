using LogisticsTracking.Application.Abstractions;
using LogisticsTracking.Application.DTOs;
using LogisticsTracking.Domain.Enums;
using MediatR;

namespace LogisticsTracking.Application.Features.Shipments;

public sealed record CreateShipmentCommand(CreateShipmentRequest Request, Guid CreatedByUserId, string CreatedByRole)
    : IRequest<ShipmentDto>;

public sealed class CreateShipmentCommandHandler(ILogisticsService service)
    : IRequestHandler<CreateShipmentCommand, ShipmentDto>
{
    public Task<ShipmentDto> Handle(CreateShipmentCommand request, CancellationToken cancellationToken)
        => service.CreateShipmentAsync(request.Request, request.CreatedByUserId, request.CreatedByRole, cancellationToken);
}

public sealed record AssignAgentCommand(Guid ShipmentId, Guid AgentId, Guid UpdatedByUserId, string UpdatedByRole)
    : IRequest<bool>;

public sealed class AssignAgentCommandHandler(ILogisticsService service)
    : IRequestHandler<AssignAgentCommand, bool>
{
    public Task<bool> Handle(AssignAgentCommand request, CancellationToken cancellationToken)
        => service.AssignAgentAsync(
            request.ShipmentId,
            request.AgentId,
            request.UpdatedByUserId,
            request.UpdatedByRole,
            cancellationToken);
}

public sealed record AcceptAssignmentCommand(Guid ShipmentId, Guid AgentId, Guid UpdatedByUserId, string UpdatedByRole)
    : IRequest<bool>;

public sealed class AcceptAssignmentCommandHandler(ILogisticsService service)
    : IRequestHandler<AcceptAssignmentCommand, bool>
{
    public Task<bool> Handle(AcceptAssignmentCommand request, CancellationToken cancellationToken)
        => service.AcceptAssignmentAsync(
            request.ShipmentId,
            request.AgentId,
            request.UpdatedByUserId,
            request.UpdatedByRole,
            cancellationToken);
}

public sealed record RejectAssignmentCommand(Guid ShipmentId, Guid AgentId, string Reason, Guid UpdatedByUserId, string UpdatedByRole)
    : IRequest<bool>;

public sealed class RejectAssignmentCommandHandler(ILogisticsService service)
    : IRequestHandler<RejectAssignmentCommand, bool>
{
    public Task<bool> Handle(RejectAssignmentCommand request, CancellationToken cancellationToken)
        => service.RejectAssignmentAsync(
            request.ShipmentId,
            request.AgentId,
            request.Reason,
            request.UpdatedByUserId,
            request.UpdatedByRole,
            cancellationToken);
}

public sealed record RateDeliveryAgentCommand(Guid ShipmentId, int Rating, string? Comment, Guid RatedByUserId, string RatedByRole)
    : IRequest<bool>;

public sealed class RateDeliveryAgentCommandHandler(ILogisticsService service)
    : IRequestHandler<RateDeliveryAgentCommand, bool>
{
    public Task<bool> Handle(RateDeliveryAgentCommand request, CancellationToken cancellationToken)
        => service.RateDeliveryAgentAsync(
            request.ShipmentId,
            request.Rating,
            request.Comment,
            request.RatedByUserId,
            request.RatedByRole,
            cancellationToken);
}

public sealed record AssignVehicleCommand(Guid ShipmentId, string VehicleNumber, Guid UpdatedByUserId, string UpdatedByRole)
    : IRequest<bool>;

public sealed class AssignVehicleCommandHandler(ILogisticsService service)
    : IRequestHandler<AssignVehicleCommand, bool>
{
    public Task<bool> Handle(AssignVehicleCommand request, CancellationToken cancellationToken)
        => service.AssignVehicleAsync(
            request.ShipmentId,
            request.VehicleNumber,
            request.UpdatedByUserId,
            request.UpdatedByRole,
            cancellationToken);
}

public sealed record UpdateShipmentStatusCommand(
    Guid ShipmentId,
    ShipmentStatus Status,
    string Note,
    Guid UpdatedByUserId,
    string UpdatedByRole) : IRequest<bool>;

public sealed class UpdateShipmentStatusCommandHandler(ILogisticsService service)
    : IRequestHandler<UpdateShipmentStatusCommand, bool>
{
    public Task<bool> Handle(UpdateShipmentStatusCommand request, CancellationToken cancellationToken)
        => service.UpdateShipmentStatusAsync(
            request.ShipmentId,
            request.Status,
            request.Note,
            request.UpdatedByUserId,
            request.UpdatedByRole,
            cancellationToken);
}

public sealed record UpsertShipmentOpsStateCommand(Guid ShipmentId, UpsertShipmentOpsStateRequest Request)
    : IRequest<ShipmentOpsStateDto?>;

public sealed class UpsertShipmentOpsStateCommandHandler(ILogisticsService service)
    : IRequestHandler<UpsertShipmentOpsStateCommand, ShipmentOpsStateDto?>
{
    public Task<ShipmentOpsStateDto?> Handle(UpsertShipmentOpsStateCommand request, CancellationToken cancellationToken)
        => service.UpsertShipmentOpsStateAsync(request.ShipmentId, request.Request, cancellationToken);
}

public sealed record GenerateAiRecommendationCommand(Guid ShipmentId, Guid RequestedByUserId, string RequestedByRole)
    : IRequest<ShipmentAiRecommendationDto?>;

public sealed class GenerateAiRecommendationCommandHandler(ILogisticsService service)
    : IRequestHandler<GenerateAiRecommendationCommand, ShipmentAiRecommendationDto?>
{
    public Task<ShipmentAiRecommendationDto?> Handle(GenerateAiRecommendationCommand request, CancellationToken cancellationToken)
        => service.GenerateAiRecommendationAsync(
            request.ShipmentId,
            request.RequestedByUserId,
            request.RequestedByRole,
            cancellationToken);
}

public sealed record ApproveAiRecommendationCommand(Guid RecommendationId, Guid ApprovedByUserId, string ApprovedByRole)
    : IRequest<ApproveAiRecommendationResultDto?>;

public sealed class ApproveAiRecommendationCommandHandler(ILogisticsService service)
    : IRequestHandler<ApproveAiRecommendationCommand, ApproveAiRecommendationResultDto?>
{
    public Task<ApproveAiRecommendationResultDto?> Handle(ApproveAiRecommendationCommand request, CancellationToken cancellationToken)
        => service.ApproveAiRecommendationAsync(
            request.RecommendationId,
            request.ApprovedByUserId,
            request.ApprovedByRole,
            cancellationToken);
}
