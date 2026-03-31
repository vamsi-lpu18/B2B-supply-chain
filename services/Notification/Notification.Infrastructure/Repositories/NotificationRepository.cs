using BuildingBlocks.Persistence;
using Microsoft.EntityFrameworkCore;
using Notification.Application.Abstractions;
using Notification.Domain.Entities;
using Notification.Infrastructure.Persistence;
using System.Text.Json;

namespace Notification.Infrastructure.Repositories;

internal sealed class NotificationRepository(NotificationDbContext dbContext) : INotificationRepository
{
    public async Task AddAsync(NotificationMessage message, CancellationToken cancellationToken)
    {
        await dbContext.Notifications.AddAsync(message, cancellationToken);
    }

    public Task<NotificationMessage?> GetByIdAsync(Guid notificationId, CancellationToken cancellationToken)
    {
        return dbContext.Notifications.FirstOrDefaultAsync(x => x.NotificationId == notificationId, cancellationToken);
    }

    public async Task<IReadOnlyList<NotificationMessage>> GetByRecipientAsync(Guid recipientUserId, CancellationToken cancellationToken)
    {
        var list = await dbContext.Notifications
            .AsNoTracking()
            .Where(x => x.RecipientUserId == recipientUserId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return list;
    }

    public async Task<IReadOnlyList<NotificationMessage>> GetAllAsync(CancellationToken cancellationToken)
    {
        var list = await dbContext.Notifications
            .AsNoTracking()
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return list;
    }

    public async Task AddOutboxMessageAsync(string eventType, object payload, CancellationToken cancellationToken)
    {
        var outbox = new OutboxMessage
        {
            MessageId = Guid.NewGuid(),
            EventType = eventType,
            Payload = JsonSerializer.Serialize(payload),
            Status = OutboxStatus.Pending,
            CreatedAtUtc = DateTime.UtcNow
        };

        await dbContext.OutboxMessages.AddAsync(outbox, cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        return dbContext.SaveChangesAsync(cancellationToken);
    }
}
