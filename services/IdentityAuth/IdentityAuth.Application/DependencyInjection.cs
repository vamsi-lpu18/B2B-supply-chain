using BuildingBlocks.Extensions;
using IdentityAuth.Application.Abstractions;
using IdentityAuth.Application.Services;
using Microsoft.Extensions.DependencyInjection;

namespace IdentityAuth.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddIdentityAuthApplication(this IServiceCollection services)
    {
        services.AddPlatformApplication(typeof(DependencyInjection).Assembly);
        services.AddScoped<IIdentityAuthService, IdentityAuthService>();
        return services;
    }
}
