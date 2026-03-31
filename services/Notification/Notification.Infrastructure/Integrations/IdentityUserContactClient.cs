using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;

namespace Notification.Infrastructure.Integrations;

internal sealed class IdentityUserContactClient(HttpClient httpClient, IConfiguration configuration)
{
    private sealed record IdentityUserContactResponse(Guid UserId, string FullName, string Email, string Role, string Status);

    public async Task<string?> ResolveEmailAsync(Guid userId, CancellationToken cancellationToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"api/internal/users/{userId}/contact");

        var apiKey = configuration["InternalApi:Key"];
        if (!string.IsNullOrWhiteSpace(apiKey))
        {
            request.Headers.TryAddWithoutValidation("X-Internal-Api-Key", apiKey);
        }

        var response = await httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        var payload = await response.Content.ReadFromJsonAsync<IdentityUserContactResponse>(cancellationToken: cancellationToken);
        if (payload is null)
        {
            return null;
        }

        return string.IsNullOrWhiteSpace(payload.Email) ? null : payload.Email;
    }
}
