using BuildingBlocks.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Order.Infrastructure.Persistence;
using RabbitMQ.Client;
using System.Text;

namespace Order.Infrastructure.Background;

internal sealed class OrderOutboxDispatcher(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<OrderOutboxDispatcher> logger) : BackgroundService
{
    private const string ExchangeName = "supplychain.events";
    private const int BatchSize = 20;
    private const int MaxRetryAttempts = 5;
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var dbContext = scope.ServiceProvider.GetRequiredService<OrderDbContext>();

                var pendingMessages = await dbContext.OutboxMessages
                    .Where(x => x.Status == OutboxStatus.Pending)
                    .OrderBy(x => x.CreatedAtUtc)
                    .Take(BatchSize)
                    .ToListAsync(stoppingToken);

                if (pendingMessages.Count > 0)
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

                    foreach (var message in pendingMessages)
                    {
                        try
                        {
                            var routingKey = $"order.{message.EventType.ToLowerInvariant()}";
                            var body = Encoding.UTF8.GetBytes(message.Payload);

                            await channel.BasicPublishAsync(
                                exchange: ExchangeName,
                                routingKey: routingKey,
                                mandatory: false,
                                body: body,
                                cancellationToken: stoppingToken);

                            message.Status = OutboxStatus.Published;
                            message.PublishedAtUtc = DateTime.UtcNow;
                            message.Error = null;
                        }
                        catch (Exception ex)
                        {
                            message.RetryCount += 1;
                            var error = ex.Message.Length > 2000 ? ex.Message[..2000] : ex.Message;

                            if (message.RetryCount >= MaxRetryAttempts)
                            {
                                logger.LogError(ex,
                                    "Order outbox message {MessageId} moved to failed after {RetryCount} attempts",
                                    message.MessageId,
                                    message.RetryCount);
                                message.Status = OutboxStatus.Failed;
                            }
                            else
                            {
                                logger.LogWarning(ex,
                                    "Order outbox publish retry {RetryCount}/{MaxRetryAttempts} for message {MessageId}",
                                    message.RetryCount,
                                    MaxRetryAttempts,
                                    message.MessageId);
                                message.Status = OutboxStatus.Pending;
                            }

                            message.Error = error;
                        }
                    }

                    await dbContext.SaveChangesAsync(stoppingToken);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Unexpected order outbox dispatcher error.");
            }

            await Task.Delay(PollInterval, stoppingToken);
        }
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
