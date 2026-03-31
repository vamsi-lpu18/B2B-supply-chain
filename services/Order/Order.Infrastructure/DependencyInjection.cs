using BuildingBlocks.Extensions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Order.Application.Abstractions;
using Order.Infrastructure.Background;
using Order.Infrastructure.Integrations;
using Order.Infrastructure.Persistence;
using Order.Infrastructure.Repositories;

namespace Order.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddOrderInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var sqlConnection = configuration.GetConnectionString("OrderDb")
            ?? throw new InvalidOperationException("Connection string 'OrderDb' is missing.");
        var redisConnection = configuration.GetConnectionString("Redis")
            ?? throw new InvalidOperationException("Connection string 'Redis' is missing.");

        services.AddDbContext<OrderDbContext>(options => options.UseSqlServer(sqlConnection));
        services.AddPlatformRedis(redisConnection);
        services.AddScoped<IOrderRepository, OrderRepository>();
        services.AddHttpClient<ICreditCheckGateway, PaymentCreditCheckGateway>();
        services.AddHostedService<OrderOutboxDispatcher>();

        return services;
    }
}
