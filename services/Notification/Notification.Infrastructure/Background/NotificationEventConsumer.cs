using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Notification.Application.Abstractions;
using Notification.Application.DTOs;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using System.Text;
using System.Text.Json;

namespace Notification.Infrastructure.Background;

internal sealed class NotificationEventConsumer(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<NotificationEventConsumer> logger) : BackgroundService
{
    private const string ExchangeName = "supplychain.events";
    private const string QueueName = "notification.events.queue";
    private const string DeadLetterExchangeName = "supplychain.events.dlx";
    private const string DeadLetterQueueName = "notification.events.deadletter.queue";
    private const string DeadLetterRoutingKey = "notification.deadletter";
    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var factory = BuildFactory();

                await using var connection = await factory.CreateConnectionAsync(stoppingToken);
                await using var channel = await connection.CreateChannelAsync(cancellationToken: stoppingToken);

                await channel.ExchangeDeclareAsync(
                    exchange: ExchangeName,
                    type: ExchangeType.Topic,
                    durable: true,
                    autoDelete: false,
                    cancellationToken: stoppingToken);

                await channel.ExchangeDeclareAsync(
                    exchange: DeadLetterExchangeName,
                    type: ExchangeType.Direct,
                    durable: true,
                    autoDelete: false,
                    cancellationToken: stoppingToken);

                await channel.QueueDeclareAsync(
                    queue: QueueName,
                    durable: true,
                    exclusive: false,
                    autoDelete: false,
                    arguments: new Dictionary<string, object?>
                    {
                        ["x-dead-letter-exchange"] = DeadLetterExchangeName,
                        ["x-dead-letter-routing-key"] = DeadLetterRoutingKey
                    },
                    cancellationToken: stoppingToken);

                await channel.QueueDeclareAsync(
                    queue: DeadLetterQueueName,
                    durable: true,
                    exclusive: false,
                    autoDelete: false,
                    cancellationToken: stoppingToken);

                await channel.QueueBindAsync(
                    queue: QueueName,
                    exchange: ExchangeName,
                    routingKey: "#",
                    cancellationToken: stoppingToken);

                await channel.QueueBindAsync(
                    queue: DeadLetterQueueName,
                    exchange: DeadLetterExchangeName,
                    routingKey: DeadLetterRoutingKey,
                    cancellationToken: stoppingToken);

                var consumer = new AsyncEventingBasicConsumer(channel);
                consumer.ReceivedAsync += async (_, eventArgs) =>
                {
                    var raw = Encoding.UTF8.GetString(eventArgs.Body.ToArray());

                    try
                    {
                        var sourceService = ParseSourceService(eventArgs.RoutingKey);
                        var eventType = ParseEventType(eventArgs.RoutingKey);
                        var recipientUserId = TryGetGuidFromPayload(raw, "RecipientUserId", "DealerId", "UserId");

                        using var scope = scopeFactory.CreateScope();
                        var notificationService = scope.ServiceProvider.GetRequiredService<INotificationService>();

                        await notificationService.IngestIntegrationEventAsync(
                            new IngestIntegrationEventRequest(sourceService, eventType, raw, recipientUserId),
                            stoppingToken);

                        await channel.BasicAckAsync(eventArgs.DeliveryTag, false, stoppingToken);
                    }
                    catch (Exception ex)
                    {
                        logger.LogError(ex, "Notification consumer failed for routing key {RoutingKey}", eventArgs.RoutingKey);

                        if (eventArgs.Redelivered)
                        {
                            logger.LogWarning(
                                "Notification event moved to dead-letter queue after retry, delivery tag {DeliveryTag}",
                                eventArgs.DeliveryTag);
                            await channel.BasicNackAsync(eventArgs.DeliveryTag, false, false, stoppingToken);
                        }
                        else
                        {
                            await channel.BasicNackAsync(eventArgs.DeliveryTag, false, true, stoppingToken);
                        }
                    }
                };

                await channel.BasicConsumeAsync(
                    queue: QueueName,
                    autoAck: false,
                    consumer: consumer,
                    cancellationToken: stoppingToken);

                logger.LogInformation("Notification consumer connected to RabbitMQ and listening on queue {QueueName}", QueueName);

                while (!stoppingToken.IsCancellationRequested && connection.IsOpen)
                {
                    await Task.Delay(RetryDelay, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Notification consumer connection loop failed. Retrying in {RetryDelaySeconds}s.", RetryDelay.TotalSeconds);
                await Task.Delay(RetryDelay, stoppingToken);
            }
        }
    }

    private static string ParseSourceService(string routingKey)
    {
        if (string.IsNullOrWhiteSpace(routingKey) || !routingKey.Contains('.'))
        {
            return "unknown";
        }

        return routingKey.Split('.', 2)[0];
    }

    private static string ParseEventType(string routingKey)
    {
        if (string.IsNullOrWhiteSpace(routingKey) || !routingKey.Contains('.'))
        {
            return "unknown";
        }

        return routingKey.Split('.', 2)[1];
    }

    private static Guid? TryGetGuidFromPayload(string rawPayload, params string[] propertyNames)
    {
        try
        {
            using var document = JsonDocument.Parse(rawPayload);
            var nameSet = new HashSet<string>(propertyNames, StringComparer.OrdinalIgnoreCase);
            return TryFindGuid(document.RootElement, nameSet);
        }
        catch
        {
            return null;
        }
    }

    private static Guid? TryFindGuid(JsonElement element, HashSet<string> names)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var property in element.EnumerateObject())
                {
                    if (names.Contains(property.Name) && TryParseGuid(property.Value, out var guidValue))
                    {
                        return guidValue;
                    }

                    var nested = TryFindGuid(property.Value, names);
                    if (nested.HasValue)
                    {
                        return nested;
                    }
                }

                break;
            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray())
                {
                    var nested = TryFindGuid(item, names);
                    if (nested.HasValue)
                    {
                        return nested;
                    }
                }

                break;
        }

        return null;
    }

    private static bool TryParseGuid(JsonElement element, out Guid guid)
    {
        if (element.ValueKind == JsonValueKind.String)
        {
            return Guid.TryParse(element.GetString(), out guid);
        }

        if (element.ValueKind == JsonValueKind.Object && element.TryGetProperty("value", out var nested))
        {
            return TryParseGuid(nested, out guid);
        }

        guid = default;
        return false;
    }

    private ConnectionFactory BuildFactory()
    {
        var connectionString = configuration.GetConnectionString("RabbitMq") ?? "localhost:5672";

        if (connectionString.StartsWith("amqp://", StringComparison.OrdinalIgnoreCase) ||
            connectionString.StartsWith("amqps://", StringComparison.OrdinalIgnoreCase))
        {
            return new ConnectionFactory
            {
                Uri = new Uri(connectionString)
            };
        }

        var parts = connectionString.Split(':', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        var host = parts.Length > 0 ? parts[0] : "localhost";
        var port = parts.Length > 1 && int.TryParse(parts[1], out var parsedPort) ? parsedPort : 5672;

        return new ConnectionFactory
        {
            HostName = host,
            Port = port,
            UserName = "guest",
            Password = "guest"
        };
    }
}
