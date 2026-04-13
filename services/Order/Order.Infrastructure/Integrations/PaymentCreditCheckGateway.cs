using Microsoft.Extensions.Configuration;
using Order.Application.Abstractions;
using Order.Application.DTOs;
using System.Net.Http.Json;

namespace Order.Infrastructure.Integrations;

internal sealed class PaymentCreditCheckGateway(HttpClient httpClient, IConfiguration configuration) : ICreditCheckGateway
{
    private readonly string _baseUrl = configuration["ExternalServices:PaymentBaseUrl"] ?? "http://localhost:8005";
    private readonly string? _internalApiKey = configuration["InternalApi:Key"];

    public async Task<CreditCheckResult> CheckCreditAsync(Guid dealerId, decimal amount, CancellationToken cancellationToken)
    {
        var endpoint = new Uri(new Uri(_baseUrl), $"/api/payment/internal/dealers/{dealerId}/credit-check?amount={amount}");

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
            if (!string.IsNullOrWhiteSpace(_internalApiKey))
            {
                request.Headers.TryAddWithoutValidation("X-Internal-Api-Key", _internalApiKey);
            }

            using var response = await httpClient.SendAsync(request, cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                var payload = await response.Content.ReadFromJsonAsync<CreditCheckResult>(cancellationToken: cancellationToken);
                if (payload is not null)
                {
                    return payload;
                }
            }
        }
        catch
        {
            // If payment service is unavailable, keep order safe by holding it for admin approval.
        }

        return new CreditCheckResult(false, 0m, 0m, 0m);
    }
}
