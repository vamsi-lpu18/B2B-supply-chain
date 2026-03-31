using BuildingBlocks.Application.Contracts;
using StackExchange.Redis;

namespace BuildingBlocks.Extensions;

internal sealed class RedisIdempotencyStore(IConnectionMultiplexer redis) : IIdempotencyStore
{
    private readonly IDatabase _database = redis.GetDatabase();

    public Task<bool> TryBeginAsync(string key, TimeSpan ttl, CancellationToken cancellationToken = default)
    {
        return _database.StringSetAsync($"idempotency:{key}", "1", ttl, when: When.NotExists);
    }
}
