using BuildingBlocks.Extensions;
using Microsoft.Extensions.DependencyInjection;
using PaymentInvoice.Application.Abstractions;
using PaymentInvoice.Application.Services;

namespace PaymentInvoice.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddPaymentInvoiceApplication(this IServiceCollection services)
    {
        services.AddPlatformApplication(typeof(DependencyInjection).Assembly);
        services.AddScoped<IPaymentInvoiceService, PaymentInvoiceService>();
        return services;
    }
}
