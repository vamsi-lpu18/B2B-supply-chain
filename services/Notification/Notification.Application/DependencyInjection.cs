using BuildingBlocks.Extensions;
using Microsoft.Extensions.DependencyInjection;
using Notification.Application.Abstractions;
using Notification.Application.Services;

namespace Notification.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddNotificationApplication(this IServiceCollection services)
    {
        services.AddPlatformApplication(typeof(DependencyInjection).Assembly);
        services.AddScoped<INotificationService, NotificationService>();
        return services;
    }
}
