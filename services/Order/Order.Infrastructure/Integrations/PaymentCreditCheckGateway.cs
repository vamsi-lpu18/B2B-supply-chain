using Microsoft.Extensions.Configuration;
using Order.Application.Abstractions;
using Order.Application.DTOs;
using System.Net.Http.Json;

namespace Order.Infrastructure.Integrations;

internal sealed class PaymentCreditCheckGateway(HttpClient httpClient, IConfiguration configuration) : ICreditCheckGateway
{
    private readonly string _baseUrl = configuration["ExternalServices:PaymentBaseUrl"] ?? "http://localhost:8005";

    public async Task<CreditCheckResult> CheckCreditAsync(Guid dealerId, decimal amount, CancellationToken cancellationToken)
    {
        var endpoint = new Uri(new Uri(_baseUrl), $"/api/payment/dealers/{dealerId}/credit-check?amount={amount}");

        try
        {
            var response = await httpClient.GetFromJsonAsync<CreditCheckResult>(endpoint, cancellationToken);
            if (response is not null)
            {
                return response;
            }
        }
        catch
        {
            // If payment service is unavailable, keep order safe by holding it for admin approval.
        }

        return new CreditCheckResult(false, 0m, 0m, 0m);
    }
}
