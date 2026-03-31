using BuildingBlocks.Extensions;
using CatalogInventory.Application.Abstractions;
using CatalogInventory.Infrastructure.Background;
using CatalogInventory.Infrastructure.Cache;
using CatalogInventory.Infrastructure.Persistence;
using CatalogInventory.Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace CatalogInventory.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddCatalogInventoryInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var sqlConnection = configuration.GetConnectionString("InventoryDb")
            ?? throw new InvalidOperationException("Connection string 'InventoryDb' is missing.");
        var redisConnection = configuration.GetConnectionString("Redis")
            ?? throw new InvalidOperationException("Connection string 'Redis' is missing.");

        services.AddDbContext<CatalogInventoryDbContext>(options => options.UseSqlServer(sqlConnection));
        services.AddPlatformRedis(redisConnection);
        services.AddScoped<IProductRepository, CatalogInventoryRepository>();
        services.AddSingleton<IInventoryCacheStore, RedisInventoryCacheStore>();
        services.AddHostedService<CatalogOutboxDispatcher>();

        return services;
    }
}
