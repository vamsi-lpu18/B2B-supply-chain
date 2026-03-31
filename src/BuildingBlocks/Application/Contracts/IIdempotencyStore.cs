namespace BuildingBlocks.Application.Contracts;

public interface IIdempotencyStore
{
    Task<bool> TryBeginAsync(string key, TimeSpan ttl, CancellationToken cancellationToken = default);
}
