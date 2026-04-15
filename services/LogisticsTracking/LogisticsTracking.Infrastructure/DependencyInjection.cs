using BuildingBlocks.Extensions;
using LogisticsTracking.Application.Abstractions;
using LogisticsTracking.Infrastructure.Background;
using LogisticsTracking.Infrastructure.Llm;
using LogisticsTracking.Infrastructure.Persistence;
using LogisticsTracking.Infrastructure.Repositories;
using BuildingBlocks.Persistence;
using Microsoft.Extensions.Options;
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
        services
            .AddOptions<LogisticsLlmOptions>()
            .Bind(configuration.GetSection(LogisticsLlmOptions.SectionName));
        services.AddHttpClient<ILogisticsChatLlmClient, OpenAiLogisticsChatLlmClient>((sp, client) =>
        {
            var options = sp.GetRequiredService<IOptions<LogisticsLlmOptions>>().Value;
            var timeoutSeconds = options.TimeoutSeconds < 5
                ? 5
                : options.TimeoutSeconds > 120
                    ? 120
                    : options.TimeoutSeconds;
            client.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
        });
        services.AddScoped<IShipmentRepository, ShipmentRepository>();
        services.AddHostedService<LogisticsOutboxDispatcher>();

        return services;
    }
}
