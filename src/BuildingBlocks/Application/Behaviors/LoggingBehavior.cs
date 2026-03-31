using MediatR;
using Microsoft.Extensions.Logging;

namespace BuildingBlocks.Application.Behaviors;

public sealed class LoggingBehavior<TRequest, TResponse>(ILogger<LoggingBehavior<TRequest, TResponse>> logger)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var requestType = typeof(TRequest).Name;
        var startedAt = DateTime.UtcNow;

        logger.LogInformation("Handling {RequestType} at {StartedAt}", requestType, startedAt);

        var response = await next();

        var durationMs = (DateTime.UtcNow - startedAt).TotalMilliseconds;
        logger.LogInformation("Handled {RequestType} in {ElapsedMs}ms", requestType, durationMs);

        return response;
    }
}
