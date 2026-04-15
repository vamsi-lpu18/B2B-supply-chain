namespace LogisticsTracking.Infrastructure.Llm;

internal sealed class LogisticsLlmOptions
{
    public const string SectionName = "LogisticsLlm";

    public string Provider { get; set; } = "OpenAI";
    public string BaseUrl { get; set; } = "https://api.openai.com/v1";
    public string Model { get; set; } = "gpt-4o-mini";
    public string ApiKey { get; set; } = string.Empty;
    public double Temperature { get; set; } = 0.2;
    public int MaxTokens { get; set; } = 350;
    public int TimeoutSeconds { get; set; } = 30;
}
