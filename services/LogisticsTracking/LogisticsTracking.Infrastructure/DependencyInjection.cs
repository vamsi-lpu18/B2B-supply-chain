using BuildingBlocks.Extensions;
using LogisticsTracking.Application.Abstractions;
using LogisticsTracking.Infrastructure.Ai;
using LogisticsTracking.Infrastructure.Background;
using LogisticsTracking.Infrastructure.Persistence;
using LogisticsTracking.Infrastructure.Repositories;
using BuildingBlocks.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LogisticsTracking.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddLogisticsTrackingInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var sqlConnection = configuration.GetConnectionString("LogisticsDb")
            ?? throw new InvalidOperationException("Connection string 'LogisticsDb' is missing.");
        var redisConnection = configuration.GetConnectionString("Redis")
            ?? throw new InvalidOperationException("Connection string 'Redis' is missing.");

        services.AddDbContext<LogisticsTrackingDbContext>(options => options.UseSqlServer(sqlConnection));
        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<LogisticsTrackingDbContext>());
        services.AddPlatformRedis(redisConnection);
        services.AddScoped<IShipmentRepository, ShipmentRepository>();
        services.Configure<ShipmentAiProviderOptions>(configuration.GetSection("Ai"));
        services.AddHttpClient("GeminiShipmentAi");
        services.AddSingleton<IShipmentAiRecommendationProvider, GeminiShipmentAiRecommendationProvider>();
        services.AddHostedService<LogisticsOutboxDispatcher>();

        return services;
    }
}
