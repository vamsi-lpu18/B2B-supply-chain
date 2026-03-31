using BuildingBlocks.Extensions;
using Notification.Application.Abstractions;
using Notification.Infrastructure.Background;
using Notification.Infrastructure.Email;
using Notification.Infrastructure.Integrations;
using Notification.Infrastructure.Persistence;
using Notification.Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Notification.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddNotificationInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var sqlConnection = configuration.GetConnectionString("NotificationDb")
            ?? throw new InvalidOperationException("Connection string 'NotificationDb' is missing.");
        var redisConnection = configuration.GetConnectionString("Redis")
            ?? throw new InvalidOperationException("Connection string 'Redis' is missing.");

        services.AddDbContext<NotificationDbContext>(options => options.UseSqlServer(sqlConnection));
        services.AddPlatformRedis(redisConnection);
        services.AddScoped<INotificationRepository, NotificationRepository>();
        services.AddScoped<SmtpEmailSender>();
        services.AddScoped<IdentityUserContactClient>(serviceProvider =>
        {
            var config = serviceProvider.GetRequiredService<IConfiguration>();
            var identityBaseUrl = config["ExternalServices:IdentityBaseUrl"] ?? "http://localhost:8001";
            var client = new HttpClient
            {
                BaseAddress = new Uri(identityBaseUrl),
                Timeout = TimeSpan.FromSeconds(10)
            };

            return new IdentityUserContactClient(client, config);
        });
        services.Configure<EmailSettings>(configuration.GetSection("Email"));
        services.AddHostedService<NotificationEventConsumer>();
        services.AddHostedService<NotificationEmailDispatcher>();

        return services;
    }
}
