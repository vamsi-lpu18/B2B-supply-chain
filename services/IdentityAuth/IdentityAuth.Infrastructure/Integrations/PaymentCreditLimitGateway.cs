using IdentityAuth.Application.Abstractions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using System.Net.Http.Json;

namespace IdentityAuth.Infrastructure.Integrations;

internal sealed class PaymentCreditLimitGateway(
    HttpClient httpClient,
    IConfiguration configuration,
    ILogger<PaymentCreditLimitGateway> logger) : ICreditLimitGateway
{
    private readonly string _baseUrl = configuration["ExternalServices:PaymentBaseUrl"] ?? "http://localhost:8005";
    private readonly string? _internalApiKey = configuration["InternalApi:Key"];

    public async Task<bool> UpdateCreditLimitAsync(Guid dealerId, decimal creditLimit, CancellationToken cancellationToken)
    {
        var endpoint = new Uri(new Uri(_baseUrl), $"/api/payment/internal/dealers/{dealerId}/credit-limit");
        using var request = new HttpRequestMessage(HttpMethod.Put, endpoint)
        {
            Content = JsonContent.Create(new { creditLimit })
        };

        if (!string.IsNullOrWhiteSpace(_internalApiKey))
        {
            request.Headers.TryAddWithoutValidation("X-Internal-Api-Key", _internalApiKey);
        }

        var response = await httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            logger.LogWarning(
                "Payment credit limit sync failed for dealer {DealerId}. status={StatusCode}, body={Body}",
                dealerId,
                (int)response.StatusCode,
                body);
        }

        return response.IsSuccessStatusCode;
    }
}
