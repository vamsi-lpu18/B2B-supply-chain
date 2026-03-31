using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PaymentInvoice.Application.Abstractions;
using PaymentInvoice.Application.DTOs;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace PaymentInvoice.Infrastructure.PaymentGateway;

internal sealed class RazorpayPaymentGateway(
    IOptions<PaymentGatewaySettings> options,
    HttpClient httpClient,
    ILogger<RazorpayPaymentGateway> logger) : IExternalPaymentGateway
{
    private readonly PaymentGatewaySettings _settings = options.Value;

    public bool IsEnabled =>
        _settings.Enabled
        && string.Equals(_settings.Provider, "Razorpay", StringComparison.OrdinalIgnoreCase)
        && !string.IsNullOrWhiteSpace(_settings.Razorpay.KeyId)
        && !string.IsNullOrWhiteSpace(_settings.Razorpay.KeySecret);

    public async Task<GatewayOrderDto> CreateOrderAsync(Guid dealerId, CreateGatewayOrderRequest request, CancellationToken cancellationToken)
    {
        EnsureEnabled();

        var amountMinor = ToMinorUnits(request.Amount);
        var currency = string.IsNullOrWhiteSpace(request.Currency)
            ? _settings.Razorpay.DefaultCurrency.Trim().ToUpperInvariant()
            : request.Currency.Trim().ToUpperInvariant();
        var receipt = string.IsNullOrWhiteSpace(request.Receipt)
            ? $"rcpt-{DateTime.UtcNow:yyyyMMddHHmmss}-{dealerId:N}"[..40]
            : request.Receipt.Trim();
        var description = string.IsNullOrWhiteSpace(request.Description)
            ? "Supply Chain order payment"
            : request.Description.Trim();

        var payload = new
        {
            amount = amountMinor,
            currency,
            receipt,
            notes = new
            {
                dealerId = dealerId.ToString(),
                description
            }
        };

        var req = new HttpRequestMessage(HttpMethod.Post, BuildUri("/v1/orders"))
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };
        req.Headers.Authorization = BuildBasicAuth();

        using var resp = await httpClient.SendAsync(req, cancellationToken);
        var body = await resp.Content.ReadAsStringAsync(cancellationToken);
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogWarning("Razorpay order create failed. status={Status} body={Body}", (int)resp.StatusCode, body);
            throw new InvalidOperationException("Failed to create gateway payment order.");
        }

        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;
        var gatewayOrderId = root.GetProperty("id").GetString() ?? string.Empty;
        var returnedAmountMinor = root.GetProperty("amount").GetInt64();
        var returnedCurrency = root.GetProperty("currency").GetString() ?? currency;
        var returnedReceipt = root.TryGetProperty("receipt", out var receiptEl)
            ? (receiptEl.GetString() ?? receipt)
            : receipt;

        if (string.IsNullOrWhiteSpace(gatewayOrderId))
        {
            throw new InvalidOperationException("Gateway order id is missing in provider response.");
        }

        return new GatewayOrderDto(
            Provider: "Razorpay",
            KeyId: _settings.Razorpay.KeyId,
            GatewayOrderId: gatewayOrderId,
            AmountMinor: returnedAmountMinor,
            Amount: returnedAmountMinor / 100m,
            Currency: returnedCurrency,
            Receipt: returnedReceipt,
            Description: description,
            TestMode: _settings.TestMode);
    }

    public async Task<GatewayPaymentVerificationDto> VerifyPaymentAsync(Guid dealerId, VerifyGatewayPaymentRequest request, CancellationToken cancellationToken)
    {
        EnsureEnabled();

        if (!IsSignatureValid(request.GatewayOrderId, request.GatewayPaymentId, request.Signature))
        {
            return new GatewayPaymentVerificationDto(
                Verified: false,
                Provider: "Razorpay",
                GatewayOrderId: request.GatewayOrderId,
                GatewayPaymentId: request.GatewayPaymentId,
                FailureReason: "Invalid gateway signature.");
        }

        if (_settings.Razorpay.CapturePayments)
        {
            var captureOk = await CapturePaymentAsync(request, cancellationToken);
            if (!captureOk)
            {
                return new GatewayPaymentVerificationDto(
                    Verified: false,
                    Provider: "Razorpay",
                    GatewayOrderId: request.GatewayOrderId,
                    GatewayPaymentId: request.GatewayPaymentId,
                    FailureReason: "Payment verification succeeded but capture failed.");
            }
        }

        return new GatewayPaymentVerificationDto(
            Verified: true,
            Provider: "Razorpay",
            GatewayOrderId: request.GatewayOrderId,
            GatewayPaymentId: request.GatewayPaymentId,
            FailureReason: null);
    }

    private async Task<bool> CapturePaymentAsync(VerifyGatewayPaymentRequest request, CancellationToken cancellationToken)
    {
        var amountMinor = ToMinorUnits(request.Amount);
        var currency = string.IsNullOrWhiteSpace(request.Currency)
            ? _settings.Razorpay.DefaultCurrency.Trim().ToUpperInvariant()
            : request.Currency.Trim().ToUpperInvariant();

        var content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["amount"] = amountMinor.ToString(),
            ["currency"] = currency
        });

        var req = new HttpRequestMessage(HttpMethod.Post, BuildUri($"/v1/payments/{request.GatewayPaymentId}/capture"))
        {
            Content = content
        };
        req.Headers.Authorization = BuildBasicAuth();

        using var resp = await httpClient.SendAsync(req, cancellationToken);
        var body = await resp.Content.ReadAsStringAsync(cancellationToken);
        if (resp.IsSuccessStatusCode)
        {
            return true;
        }

        if ((int)resp.StatusCode == 400 && body.Contains("already captured", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        logger.LogWarning("Razorpay capture failed. status={Status} body={Body}", (int)resp.StatusCode, body);
        return false;
    }

    private bool IsSignatureValid(string orderId, string paymentId, string providedSignature)
    {
        var input = $"{orderId}|{paymentId}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_settings.Razorpay.KeySecret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(input));
        var expectedHex = Convert.ToHexString(hash).ToLowerInvariant();
        var actualHex = providedSignature.Trim().ToLowerInvariant();

        var expectedBytes = Encoding.UTF8.GetBytes(expectedHex);
        var actualBytes = Encoding.UTF8.GetBytes(actualHex);
        return CryptographicOperations.FixedTimeEquals(expectedBytes, actualBytes);
    }

    private AuthenticationHeaderValue BuildBasicAuth()
    {
        var token = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_settings.Razorpay.KeyId}:{_settings.Razorpay.KeySecret}"));
        return new AuthenticationHeaderValue("Basic", token);
    }

    private Uri BuildUri(string path)
    {
        var baseUrl = _settings.Razorpay.BaseUrl.TrimEnd('/');
        return new Uri($"{baseUrl}{path}");
    }

    private static long ToMinorUnits(decimal amount)
    {
        return decimal.ToInt64(decimal.Round(amount * 100m, 0, MidpointRounding.AwayFromZero));
    }

    private void EnsureEnabled()
    {
        if (!IsEnabled)
        {
            throw new InvalidOperationException("Razorpay gateway is not configured or disabled.");
        }
    }
}
