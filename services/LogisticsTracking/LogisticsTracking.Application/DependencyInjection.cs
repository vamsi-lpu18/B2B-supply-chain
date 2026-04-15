using BuildingBlocks.Extensions;
using Microsoft.Extensions.DependencyInjection;
using LogisticsTracking.Application.Abstractions;
using LogisticsTracking.Application.Services;

namespace LogisticsTracking.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddLogisticsTrackingApplication(this IServiceCollection services)
    {
        services.AddPlatformApplication(typeof(DependencyInjection).Assembly);
        services.AddScoped<ILogisticsService, LogisticsService>();
        return services;
    }
}
