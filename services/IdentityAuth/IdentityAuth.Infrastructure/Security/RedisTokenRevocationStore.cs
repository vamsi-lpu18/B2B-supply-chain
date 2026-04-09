using IdentityAuth.Application.Abstractions;
using StackExchange.Redis;

namespace IdentityAuth.Infrastructure.Security;

internal sealed class RedisTokenRevocationStore(IConnectionMultiplexer redis) : ITokenRevocationStore
{
    private readonly IDatabase _database = redis.GetDatabase();

    public Task RevokeAsync(string jti, DateTime expiresAtUtc, CancellationToken cancellationToken)
    {
        var ttl = expiresAtUtc <= DateTime.UtcNow
            ? TimeSpan.FromMinutes(5)
            : expiresAtUtc - DateTime.UtcNow;

        try
        {
            return _database.StringSetAsync($"revoked:tokens:{jti}", "1", ttl);
        }
        catch (RedisException)
        {
            return Task.CompletedTask;
        }
    }

    public async Task<bool> IsRevokedAsync(string jti, CancellationToken cancellationToken)
    {
        try
        {
            return await _database.KeyExistsAsync($"revoked:tokens:{jti}");
        }
        catch (RedisException)
        {
            return false;
        }
    }
}
