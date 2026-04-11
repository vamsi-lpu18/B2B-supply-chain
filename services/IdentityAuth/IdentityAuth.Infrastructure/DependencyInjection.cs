using BuildingBlocks.Extensions;
using IdentityAuth.Application.Abstractions;
using IdentityAuth.Infrastructure.Background;
using IdentityAuth.Infrastructure.Integrations;
using IdentityAuth.Infrastructure.Persistence;
using IdentityAuth.Infrastructure.Repositories;
using IdentityAuth.Infrastructure.Security;
using BuildingBlocks.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace IdentityAuth.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddIdentityAuthInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var sqlConnection = configuration.GetConnectionString("IdentityDb")
            ?? throw new InvalidOperationException("Connection string 'IdentityDb' is missing.");
        var redisConnection = configuration.GetConnectionString("Redis")
            ?? throw new InvalidOperationException("Connection string 'Redis' is missing.");

        services.AddDbContext<IdentityAuthDbContext>(options => options.UseSqlServer(sqlConnection));
        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<IdentityAuthDbContext>());
        services.AddPlatformRedis(redisConnection);
        services.AddScoped<IUserRepository, IdentityUserRepository>();
        services.AddSingleton<ITokenService, JwtTokenService>();
        services.AddSingleton<IPasswordService, PasswordService>();
        services.AddSingleton<IOtpService, OtpService>();
        services.AddSingleton<ITokenRevocationStore, RedisTokenRevocationStore>();
        services.AddHttpClient<ICreditLimitGateway, PaymentCreditLimitGateway>();
        services.AddHttpClient<INotificationGateway, NotificationGateway>();
        services.AddHostedService<IdentityOutboxDispatcher>();

        return services;
    }
}
