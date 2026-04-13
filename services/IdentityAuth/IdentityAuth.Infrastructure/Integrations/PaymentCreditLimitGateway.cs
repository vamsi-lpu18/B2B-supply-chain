using IdentityAuth.Application.Abstractions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using System.Net.Http.Json;
using System.Net;

namespace IdentityAuth.Infrastructure.Integrations;

internal sealed class PaymentCreditLimitGateway(
    HttpClient httpClient,
    IConfiguration configuration,
    ILogger<PaymentCreditLimitGateway> logger) : ICreditLimitGateway
{
    private const int _maxAttempts = 3;
    private readonly string _baseUrl = configuration["ExternalServices:PaymentBaseUrl"] ?? "http://localhost:8005";
    private readonly string? _internalApiKey = configuration["InternalApi:Key"];

    public async Task<bool> UpdateCreditLimitAsync(Guid dealerId, decimal creditLimit, CancellationToken cancellationToken)
    {
        var endpoint = new Uri(new Uri(_baseUrl), $"/api/payment/internal/dealers/{dealerId}/credit-limit");
        for (var attempt = 1; attempt <= _maxAttempts; attempt++)
        {
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Put, endpoint)
                {
                    Content = JsonContent.Create(new { creditLimit })
                };

                if (!string.IsNullOrWhiteSpace(_internalApiKey))
                {
                    request.Headers.TryAddWithoutValidation("X-Internal-Api-Key", _internalApiKey);
                }

                using var response = await httpClient.SendAsync(request, cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    return true;
                }

                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                logger.LogWarning(
                    "Payment credit limit sync failed for dealer {DealerId}. attempt={Attempt}/{MaxAttempts}, status={StatusCode}, body={Body}",
                    dealerId,
                    attempt,
                    _maxAttempts,
                    (int)response.StatusCode,
                    body);

                if (!IsTransientStatusCode(response.StatusCode) || attempt == _maxAttempts)
                {
                    return false;
                }
            }
            catch (HttpRequestException ex) when (attempt < _maxAttempts)
            {
                logger.LogWarning(
                    ex,
                    "Payment credit limit sync transient network error for dealer {DealerId}. attempt={Attempt}/{MaxAttempts}",
                    dealerId,
                    attempt,
                    _maxAttempts);
            }
            catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested && attempt < _maxAttempts)
            {
                logger.LogWarning(
                    ex,
                    "Payment credit limit sync timeout for dealer {DealerId}. attempt={Attempt}/{MaxAttempts}",
                    dealerId,
                    attempt,
                    _maxAttempts);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Payment credit limit sync unexpected failure for dealer {DealerId}", dealerId);
                return false;
            }

            if (attempt < _maxAttempts)
            {
                await Task.Delay(TimeSpan.FromMilliseconds(150 * attempt), cancellationToken);
            }
        }

        return false;
    }

    private static bool IsTransientStatusCode(HttpStatusCode statusCode)
    {
        var code = (int)statusCode;
        return code is >= 500 and <= 599 or 408 or 429;
    }
}
