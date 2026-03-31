using BuildingBlocks.Application.Contracts;
using MediatR;

namespace BuildingBlocks.Application.Behaviors;

public sealed class IdempotencyBehavior<TRequest, TResponse>(IIdempotencyStore idempotencyStore)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        if (request is not IIdempotentRequest<TResponse> idempotentRequest)
        {
            return await next();
        }

        var lockAcquired = await idempotencyStore.TryBeginAsync(idempotentRequest.IdempotencyKey, TimeSpan.FromHours(24), cancellationToken);

        if (!lockAcquired)
        {
            throw new InvalidOperationException($"Duplicate idempotent request detected for key '{idempotentRequest.IdempotencyKey}'.");
        }

        return await next();
    }
}
