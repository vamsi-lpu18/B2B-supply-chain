using BuildingBlocks.Extensions;
using PaymentInvoice.Application.Abstractions;
using PaymentInvoice.Infrastructure.Background;
using PaymentInvoice.Infrastructure.Documents;
using PaymentInvoice.Infrastructure.PaymentGateway;
using PaymentInvoice.Infrastructure.Persistence;
using PaymentInvoice.Infrastructure.Repositories;
using BuildingBlocks.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace PaymentInvoice.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddPaymentInvoiceInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var sqlConnection = configuration.GetConnectionString("PaymentDb")
            ?? throw new InvalidOperationException("Connection string 'PaymentDb' is missing.");
        var redisConnection = configuration.GetConnectionString("Redis")
            ?? throw new InvalidOperationException("Connection string 'Redis' is missing.");

        services.AddDbContext<PaymentInvoiceDbContext>(options => options.UseSqlServer(sqlConnection));
        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<PaymentInvoiceDbContext>());
        services.AddPlatformRedis(redisConnection);

        services.AddScoped<IPaymentRepository, PaymentRepository>();
        services.AddScoped<IInvoicePdfGenerator, QuestPdfInvoiceGenerator>();
        services.Configure<PaymentGatewaySettings>(configuration.GetSection("PaymentGateway"));
        services.AddHttpClient<RazorpayPaymentGateway>();
        services.AddScoped<IExternalPaymentGateway, RazorpayPaymentGateway>();
        services.AddHostedService<PaymentOutboxDispatcher>();

        return services;
    }
}
