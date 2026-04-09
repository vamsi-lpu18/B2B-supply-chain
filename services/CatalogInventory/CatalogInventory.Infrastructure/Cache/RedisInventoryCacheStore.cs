using CatalogInventory.Application.Abstractions;
using StackExchange.Redis;
using System.Text.Json;

namespace CatalogInventory.Infrastructure.Cache;

internal sealed class RedisInventoryCacheStore(IConnectionMultiplexer redis) : IInventoryCacheStore
{
    private readonly IDatabase _database = redis.GetDatabase();

    public async Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default)
    {
        try
        {
            var value = await _database.StringGetAsync(key);
            if (!value.HasValue)
            {
                return default;
            }

            return JsonSerializer.Deserialize<T>(value.ToString());
        }
        catch (RedisException)
        {
            return default;
        }
    }
/// <summary>
/// 
/// </summary>
/// <typeparam name="T"></typeparam>
/// <param name="key"></param>
/// <param name="value"></param>
/// <param name="ttl"></param>
/// <param name="cancellationToken"></param>
/// <returns></returns>
    public async Task SetAsync<T>(string key, T value, TimeSpan ttl, CancellationToken cancellationToken = default)
    {
        try
        {
            var json = JsonSerializer.Serialize(value);
            await _database.StringSetAsync(key, json, ttl);
        }
        catch (RedisException)
        {
            return;
        }
    }

/// <summary>
/// 
/// </summary>
/// <param name="key"></param>
/// <param name="cancellationToken"></param>
/// <returns></returns>
   public async Task DeleteAsync(string key, CancellationToken cancellationToken = default)
    {
        try
        {
            await _database.KeyDeleteAsync(key);
        }
        catch (RedisException)
        {
            return;
        }
    }

    public async Task<bool> SetIfNotExistsAsync(string key, int value, TimeSpan ttl, CancellationToken cancellationToken = default)
    {
        try
        {
            return await _database.StringSetAsync(key, value, ttl, when: When.NotExists);
        }
        catch (RedisException)
        {
            return false;
        }
    }
    /// <summary>
    /// 
    /// </summary>
    /// <param name="key"></param>
    /// <param name="cancellationToken"></param>
    /// <returns></returns>

    public async Task<int?> GetIntAsync(string key, CancellationToken cancellationToken = default)
    {
        try
        {
            var value = await _database.StringGetAsync(key);
            if (!value.HasValue)
            {
                return null;
            }

            return (int)value;
        }
        catch (RedisException)
        {
            return null;
        }
    }

    public async Task AddTrackedKeyAsync(string trackerKey, string key, CancellationToken cancellationToken = default)
    {
        try
        {
            await _database.SetAddAsync(trackerKey, key);
        }
        catch (RedisException)
        {
            return;
        }
    }

    public async Task InvalidateTrackedKeysAsync(string trackerKey, CancellationToken cancellationToken = default)
    {
        try
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
        catch (RedisException)
        {
            return;
        }
    }
}
