using System.Net.Http.Json;
using System.Net;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Order.Application.Abstractions;

namespace Order.Infrastructure.Integrations;

internal sealed class CatalogInventoryGateway(
    HttpClient httpClient,
    IConfiguration configuration,
    ILogger<CatalogInventoryGateway> logger) : IInventoryGateway
{
    private const int _maxAttempts = 3;
    private readonly string _baseUrl = configuration["ExternalServices:CatalogBaseUrl"] ?? "http://localhost:8002";
    private readonly string? _internalApiKey = configuration["InternalApi:Key"];

    public Task<bool> SoftLockStockAsync(Guid orderId, Guid productId, int quantity, CancellationToken cancellationToken)
    {
        return PostAsync(
            "/api/internal/inventory/soft-lock",
            new InventoryQuantityRequest(productId, orderId, quantity),
            "soft-lock",
            productId,
            orderId,
            cancellationToken);
    }

    public Task<bool> HardDeductStockAsync(Guid orderId, Guid productId, int quantity, CancellationToken cancellationToken)
    {
        return PostAsync(
            "/api/internal/inventory/hard-deduct",
            new InventoryQuantityRequest(productId, orderId, quantity),
            "hard-deduct",
            productId,
            orderId,
            cancellationToken);
    }

    public Task<bool> ReleaseSoftLockAsync(Guid orderId, Guid productId, CancellationToken cancellationToken)
    {
        return PostAsync(
            "/api/internal/inventory/release-soft-lock",
            new InventoryReleaseRequest(productId, orderId),
            "release-soft-lock",
            productId,
            orderId,
            cancellationToken);
    }

    public Task<bool> RestockStockAsync(Guid orderId, Guid productId, int quantity, string referenceId, CancellationToken cancellationToken)
    {
        return PostAsync(
            "/api/internal/inventory/restock",
            new InventoryRestockRequest(productId, quantity, referenceId),
            "restock",
            productId,
            orderId,
            cancellationToken);
    }

    private async Task<bool> PostAsync<TRequest>(
        string path,
        TRequest payload,
        string operation,
        Guid productId,
        Guid orderId,
        CancellationToken cancellationToken)
    {
        var endpoint = new Uri(new Uri(_baseUrl.TrimEnd('/') + "/"), path.TrimStart('/'));
        for (var attempt = 1; attempt <= _maxAttempts; attempt++)
        {
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
                {
                    Content = JsonContent.Create(payload)
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
                    "Catalog inventory {Operation} failed for order {OrderId}, product {ProductId}. attempt={Attempt}/{MaxAttempts}, status={StatusCode}, body={Body}",
                    operation,
                    orderId,
                    productId,
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
                    "Catalog inventory {Operation} transient network error for order {OrderId}, product {ProductId}. attempt={Attempt}/{MaxAttempts}",
                    operation,
                    orderId,
                    productId,
                    attempt,
                    _maxAttempts);
            }
            catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested && attempt < _maxAttempts)
            {
                logger.LogWarning(
                    ex,
                    "Catalog inventory {Operation} timeout for order {OrderId}, product {ProductId}. attempt={Attempt}/{MaxAttempts}",
                    operation,
                    orderId,
                    productId,
                    attempt,
                    _maxAttempts);
            }
            catch (Exception ex)
            {
                logger.LogError(
                    ex,
                    "Catalog inventory {Operation} unexpected failure for order {OrderId}, product {ProductId}",
                    operation,
                    orderId,
                    productId);
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

    private sealed record InventoryQuantityRequest(Guid ProductId, Guid OrderId, int Quantity);
    private sealed record InventoryReleaseRequest(Guid ProductId, Guid OrderId);
    private sealed record InventoryRestockRequest(Guid ProductId, int Quantity, string ReferenceId);
}
