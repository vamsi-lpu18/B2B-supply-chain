using LogisticsTracking.Application.Abstractions;
using LogisticsTracking.Domain.Enums;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;

namespace LogisticsTracking.Infrastructure.Ai;

internal sealed class GeminiShipmentAiRecommendationProvider(
    IHttpClientFactory httpClientFactory,
    IOptions<ShipmentAiProviderOptions> options,
    ILogger<GeminiShipmentAiRecommendationProvider> logger)
    : IShipmentAiRecommendationProvider
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public async Task<ShipmentAiGenerationResult?> GenerateAsync(ShipmentAiGenerationRequest request, CancellationToken cancellationToken)
    {
        var settings = options.Value;
        if (!settings.Enabled)
        {
            return null;
        }

        if (!string.Equals(settings.Provider, "gemini", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var apiKey = string.IsNullOrWhiteSpace(settings.ApiKey)
            ? Environment.GetEnvironmentVariable("AI_PROVIDER_API_KEY")
            : settings.ApiKey;

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return null;
        }

        var endpoint = BuildEndpoint(settings, apiKey);
        var payload = BuildRequestPayload(request, settings);

        try
        {
            var client = httpClientFactory.CreateClient("GeminiShipmentAi");
            client.Timeout = TimeSpan.FromSeconds(Math.Clamp(settings.TimeoutSeconds, 5, 60));

            using var response = await client.PostAsJsonAsync(endpoint, payload, JsonOptions, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Gemini AI call failed with status code {StatusCode}", (int)response.StatusCode);
                return null;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            var envelope = await JsonSerializer.DeserializeAsync<GeminiEnvelope>(stream, JsonOptions, cancellationToken);
            var rawText = envelope?.Candidates?.FirstOrDefault()?.Content?.Parts?.FirstOrDefault()?.Text;
            if (string.IsNullOrWhiteSpace(rawText))
            {
                return null;
            }

            var json = ExtractJson(rawText);
            var recommendation = JsonSerializer.Deserialize<AiRecommendationPayload>(json, JsonOptions);
            if (recommendation is null)
            {
                return null;
            }

            var actions = MapActions(recommendation.SuggestedActions);
            if (actions.Count == 0)
            {
                return null;
            }

            return new ShipmentAiGenerationResult(
                NormalizeText(recommendation.PlaybookType, 80) ?? "AiGenerated",
                Math.Clamp(recommendation.ConfidenceScore ?? 0.7d, 0d, 1d),
                NormalizeText(recommendation.ExplanationText, 500) ?? "AI recommendation generated from current shipment context.",
                recommendation.RequiresHumanApproval ?? true,
                actions);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Gemini AI recommendation generation failed");
            return null;
        }
    }

    private static string BuildEndpoint(ShipmentAiProviderOptions settings, string apiKey)
    {
        var endpointBase = string.IsNullOrWhiteSpace(settings.EndpointBase)
            ? "https://generativelanguage.googleapis.com/v1beta/models"
            : settings.EndpointBase.TrimEnd('/');

        var model = string.IsNullOrWhiteSpace(settings.Model)
            ? "gemini-2.0-flash"
            : settings.Model.Trim();

        return $"{endpointBase}/{Uri.EscapeDataString(model)}:generateContent?key={Uri.EscapeDataString(apiKey)}";
    }

    private static object BuildRequestPayload(ShipmentAiGenerationRequest request, ShipmentAiProviderOptions settings)
    {
        var prompt = BuildPrompt(request);

        return new
        {
            contents = new[]
            {
                new
                {
                    role = "user",
                    parts = new[]
                    {
                        new { text = prompt }
                    }
                }
            },
            generationConfig = new
            {
                temperature = Math.Clamp(settings.Temperature, 0d, 1d),
                responseMimeType = "application/json"
            }
        };
    }

    private static string BuildPrompt(ShipmentAiGenerationRequest request)
    {
        return $$"""
You are an operations assistant for logistics exception handling.
Return ONLY valid JSON.

Schema:
{
  "playbookType": "string",
  "confidenceScore": 0.0,
  "explanationText": "string",
  "requiresHumanApproval": true,
  "suggestedActions": [
    {
      "actionType": "update-status|set-retry-state|no-action",
      "description": "string",
      "proposedValue": "string",
      "status": "Created|Assigned|PickedUp|InTransit|OutForDelivery|Delivered|DeliveryFailed|Returned|null",
      "handoverState": "pending|ready|exception|completed|null",
      "retryRequired": false,
      "retryCount": 0,
      "retryReason": "string|null",
      "nextRetryAtUtc": "ISO-8601|null"
    }
  ]
}

Rules:
- Return at most 3 suggestedActions.
- Keep recommendations practical and safe for human approval.
- Prefer no-action if shipment is already completed.

Shipment context:
- shipmentId: {{request.ShipmentId}}
- status: {{request.Status}}
- hasAssignedAgent: {{request.AssignedAgentId.HasValue}}
- hasVehicleNumber: {{!string.IsNullOrWhiteSpace(request.VehicleNumber)}}
- requestedByRole: {{request.RequestedByRole}}
- requestedAtUtc: {{request.RequestedAtUtc:O}}
""";
    }

    private static string ExtractJson(string text)
    {
        var trimmed = text.Trim();

        if (trimmed.StartsWith("```") && trimmed.Contains("{"))
        {
            var firstBrace = trimmed.IndexOf('{');
            var lastBrace = trimmed.LastIndexOf('}');
            if (firstBrace >= 0 && lastBrace > firstBrace)
            {
                return trimmed[firstBrace..(lastBrace + 1)];
            }
        }

        if (trimmed.StartsWith("{") && trimmed.EndsWith("}"))
        {
            return trimmed;
        }

        var start = trimmed.IndexOf('{');
        var end = trimmed.LastIndexOf('}');
        if (start >= 0 && end > start)
        {
            return trimmed[start..(end + 1)];
        }

        return trimmed;
    }

    private static IReadOnlyList<ShipmentAiGeneratedAction> MapActions(IReadOnlyList<AiActionPayload>? suggestedActions)
    {
        if (suggestedActions is null || suggestedActions.Count == 0)
        {
            return [];
        }

        var actions = new List<ShipmentAiGeneratedAction>(suggestedActions.Count);

        foreach (var item in suggestedActions)
        {
            var actionType = NormalizeText(item.ActionType, 40)?.ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(actionType))
            {
                continue;
            }

            var description = NormalizeText(item.Description, 300) ?? "AI suggested action.";
            var proposedValue = NormalizeText(item.ProposedValue, 120) ?? "NoAction";

            actions.Add(new ShipmentAiGeneratedAction(
                actionType,
                description,
                proposedValue,
                ParseStatus(item.Status),
                ParseHandoverState(item.HandoverState),
                item.RetryRequired ?? false,
                Math.Max(0, item.RetryCount ?? 0),
                NormalizeText(item.RetryReason, 300),
                ParseOptionalUtc(item.NextRetryAtUtc)));
        }

        return actions;
    }

    private static ShipmentStatus? ParseStatus(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return Enum.TryParse<ShipmentStatus>(value.Trim(), true, out var parsed)
            ? parsed
            : null;
    }

    private static HandoverState? ParseHandoverState(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Trim().ToLowerInvariant();
        return normalized switch
        {
            "pending" => HandoverState.Pending,
            "ready" => HandoverState.Ready,
            "exception" => HandoverState.Exception,
            "completed" => HandoverState.Completed,
            _ => null
        };
    }

    private static DateTime? ParseOptionalUtc(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        if (!DateTime.TryParse(value, out var parsed))
        {
            return null;
        }

        return parsed.Kind == DateTimeKind.Utc ? parsed : parsed.ToUniversalTime();
    }

    private static string? NormalizeText(string? value, int maxLength)
    {
        if (value is null)
        {
            return null;
        }

        var normalized = value.Trim();
        if (normalized.Length == 0)
        {
            return null;
        }

        return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
    }

    private sealed record GeminiEnvelope(IReadOnlyList<GeminiCandidate>? Candidates);

    private sealed record GeminiCandidate(GeminiContent? Content);

    private sealed record GeminiContent(IReadOnlyList<GeminiPart>? Parts);

    private sealed record GeminiPart(string? Text);

    private sealed record AiRecommendationPayload(
        string? PlaybookType,
        double? ConfidenceScore,
        string? ExplanationText,
        bool? RequiresHumanApproval,
        IReadOnlyList<AiActionPayload>? SuggestedActions);

    private sealed record AiActionPayload(
        string? ActionType,
        string? Description,
        string? ProposedValue,
        string? Status,
        string? HandoverState,
        bool? RetryRequired,
        int? RetryCount,
        string? RetryReason,
        string? NextRetryAtUtc);
}
