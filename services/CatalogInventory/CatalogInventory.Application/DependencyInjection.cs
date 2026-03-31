using BuildingBlocks.Extensions;
using CatalogInventory.Application.Abstractions;
using CatalogInventory.Application.Services;
using Microsoft.Extensions.DependencyInjection;

namespace CatalogInventory.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddCatalogInventoryApplication(this IServiceCollection services)
    {
        services.AddPlatformApplication(typeof(DependencyInjection).Assembly);
        services.AddScoped<ICatalogInventoryService, CatalogInventoryService>();
        return services;
    }
}
