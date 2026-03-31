using CatalogInventory.Application.Abstractions;
using StackExchange.Redis;
using System.Text.Json;

namespace CatalogInventory.Infrastructure.Cache;

internal sealed class RedisInventoryCacheStore(IConnectionMultiplexer redis) : IInventoryCacheStore
{
    private readonly IDatabase _database = redis.GetDatabase();

    public async Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default)
    {
        var value = await _database.StringGetAsync(key);
        if (!value.HasValue)
        {
            return default;
        }

        return JsonSerializer.Deserialize<T>(value.ToString());
    }

    public Task SetAsync<T>(string key, T value, TimeSpan ttl, CancellationToken cancellationToken = default)
    {
        var json = JsonSerializer.Serialize(value);
        return _database.StringSetAsync(key, json, ttl);
    }

    public Task DeleteAsync(string key, CancellationToken cancellationToken = default)
    {
        return _database.KeyDeleteAsync(key);
    }

    public Task<bool> SetIfNotExistsAsync(string key, int value, TimeSpan ttl, CancellationToken cancellationToken = default)
    {
        return _database.StringSetAsync(key, value, ttl, when: When.NotExists);
    }

    public async Task<int?> GetIntAsync(string key, CancellationToken cancellationToken = default)
    {
        var value = await _database.StringGetAsync(key);
        if (!value.HasValue)
        {
            return null;
        }

        return (int)value;
    }

    public Task AddTrackedKeyAsync(string trackerKey, string key, CancellationToken cancellationToken = default)
    {
        return _database.SetAddAsync(trackerKey, key);
    }

    public async Task InvalidateTrackedKeysAsync(string trackerKey, CancellationToken cancellationToken = default)
    {
        var keys = await _database.SetMembersAsync(trackerKey);
        if (keys.Length == 0)
        {
            return;
        }

        var redisKeys = keys.Select(k => (RedisKey)k.ToString()).ToArray();
        await _database.KeyDeleteAsync(redisKeys);
        await _database.KeyDeleteAsync(trackerKey);
    }
}
