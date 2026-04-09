using LogisticsTracking.Application.Abstractions;

namespace LogisticsTracking.Application.Services;

internal sealed class NoopShipmentAiRecommendationProvider : IShipmentAiRecommendationProvider
{
    public Task<ShipmentAiGenerationResult?> GenerateAsync(ShipmentAiGenerationRequest request, CancellationToken cancellationToken)
    {
        return Task.FromResult<ShipmentAiGenerationResult?>(null);
    }
}
