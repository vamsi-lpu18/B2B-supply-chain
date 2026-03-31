using BuildingBlocks.Persistence;
using MediatR;

namespace BuildingBlocks.Application.Behaviors;

public sealed class TransactionBehavior<TRequest, TResponse>(IApplicationDbContext dbContext)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        if (request.GetType().Name.EndsWith("Query", StringComparison.OrdinalIgnoreCase))
        {
            return await next();
        }

        var response = await next();

        await dbContext.SaveChangesAsync(cancellationToken);

        return response;
    }
}
