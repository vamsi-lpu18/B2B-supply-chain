using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using LogisticsTracking.Application.Abstractions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace LogisticsTracking.Infrastructure.Llm;

internal sealed class OpenAiLogisticsChatLlmClient(
    HttpClient httpClient,
    IOptions<LogisticsLlmOptions> options,
    ILogger<OpenAiLogisticsChatLlmClient> logger)
    : ILogisticsChatLlmClient
{
    private readonly LogisticsLlmOptions _options = options.Value;

    public bool IsEnabled =>
        !string.IsNullOrWhiteSpace(_options.ApiKey)
        && !string.IsNullOrWhiteSpace(_options.BaseUrl)
        && !string.IsNullOrWhiteSpace(_options.Model);

    public async Task<string?> GenerateReplyAsync(
        string userRole,
        string userQuestion,
        string operationsContext,
        CancellationToken cancellationToken)
    {
        if (!IsEnabled)
        {
            return null;
        }

        var endpoint = $"{_options.BaseUrl.TrimEnd('/')}/chat/completions";
        var maxTokens = _options.MaxTokens < 128
            ? 128
            : _options.MaxTokens > 1000
                ? 1000
                : _options.MaxTokens;
        var temperature = _options.Temperature < 0
            ? 0
            : _options.Temperature > 1
                ? 1
                : _options.Temperature;

        var systemInstruction =
            "You are SupplyChain Ops Assistant, a logistics operations assistant for a supply-chain platform. "
            + "Use the supplied operational context for shipment, delay, retry, and status facts, and never invent operational data. "
            + "For conversational questions (for example greetings, your name, or capabilities), reply naturally even if they are not in context. "
            + "If a logistics fact is missing from context, clearly say it is not available in current data. "
            + "Keep responses concise (2-5 lines) and end with one clear next action when it makes sense.";

        var payload = new
        {
            model = _options.Model,
            temperature,
            max_tokens = maxTokens,
            messages = new object[]
            {
                new
                {
                    role = "system",
                    content = systemInstruction
                },
                new
                {
                    role = "user",
                    content =
                        $"User role: {userRole}\n"
                        + $"Question: {userQuestion}\n\n"
                        + "Operational context:\n"
                        + operationsContext
                }
            }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.ApiKey.Trim());
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        try
        {
            using var response = await httpClient.SendAsync(request, cancellationToken);
            var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("OpenAI chat completion failed. Status: {StatusCode}", (int)response.StatusCode);
                return null;
            }

            using var document = JsonDocument.Parse(responseBody);
            if (!document.RootElement.TryGetProperty("choices", out var choices)
                || choices.ValueKind != JsonValueKind.Array
                || choices.GetArrayLength() == 0)
            {
                return null;
            }

            var firstChoice = choices[0];
            if (!firstChoice.TryGetProperty("message", out var message)
                || !message.TryGetProperty("content", out var contentElement)
                || contentElement.ValueKind != JsonValueKind.String)
            {
                return null;
            }

            return NormalizeResponse(contentElement.GetString());
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "OpenAI chat completion call failed; falling back to internal response engine.");
            return null;
        }
    }

    private static string? NormalizeResponse(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return null;
        }

        var normalized = content.Trim();
        if (normalized.Length <= 1200)
        {
            return normalized;
        }

        return normalized[..1200];
    }
}
