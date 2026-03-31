using MediatR;

namespace BuildingBlocks.Application.Contracts;

public interface IIdempotentRequest<out TResponse> : IRequest<TResponse>
{
    string IdempotencyKey { get; }
}
