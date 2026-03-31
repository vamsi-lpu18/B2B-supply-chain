using IdentityAuth.Application.Abstractions;
using Microsoft.Extensions.Configuration;
using System.Net.Http.Json;
using System.Text.Json;

namespace IdentityAuth.Infrastructure.Integrations;

internal sealed class NotificationGateway(HttpClient httpClient, IConfiguration configuration) : INotificationGateway
{
    private readonly string _baseUrl = configuration["ExternalServices:NotificationBaseUrl"] ?? "http://localhost:8006";

    public async Task<bool> SendPasswordResetOtpAsync(
        Guid userId,
        string email,
        string otpCode,
        DateTime expiresAtUtc,
        CancellationToken cancellationToken)
    {
        try
        {
            var payloadJson = JsonSerializer.Serialize(new
            {
                UserId = userId,
                Email = email,
                otpCode,
                expiresAtUtc
            });

            var endpoint = new Uri(new Uri(_baseUrl), "/api/notifications/ingest");
            var response = await httpClient.PostAsJsonAsync(endpoint, new
            {
                sourceService = "identity",
                eventType = "passwordresetrequested",
                payload = payloadJson,
                recipientUserId = userId
            }, cancellationToken);

            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }
}