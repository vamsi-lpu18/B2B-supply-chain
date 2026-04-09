namespace LogisticsTracking.Infrastructure.Ai;

internal sealed class ShipmentAiProviderOptions
{
    public string Provider { get; set; } = "none";
    public bool Enabled { get; set; }
    public string? ApiKey { get; set; }
    public string Model { get; set; } = "gemini-2.0-flash";
    public string EndpointBase { get; set; } = "https://generativelanguage.googleapis.com/v1beta/models";
    public int TimeoutSeconds { get; set; } = 15;
    public double Temperature { get; set; } = 0.2d;
}
