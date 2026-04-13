using BuildingBlocks.Persistence;
using IdentityAuth.Application.Abstractions;
using IdentityAuth.Domain.Entities;
using IdentityAuth.Domain.Enums;
using IdentityAuth.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace IdentityAuth.Infrastructure.Repositories;

internal sealed class IdentityUserRepository(IdentityAuthDbContext dbContext) : IUserRepository
{
    public async Task AddUserAsync(User user, CancellationToken cancellationToken)
    {
        await dbContext.Users.AddAsync(user, cancellationToken);
    }

    public Task<User?> GetByEmailAsync(string email, CancellationToken cancellationToken)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        return dbContext.Users
            .Include(x => x.DealerProfile)
            .FirstOrDefaultAsync(x => x.Email == normalizedEmail, cancellationToken);
    }

    public Task<User?> GetByIdAsync(Guid userId, CancellationToken cancellationToken)
    {
        return dbContext.Users
            .Include(x => x.DealerProfile)
            .FirstOrDefaultAsync(x => x.UserId == userId, cancellationToken);
    }

    public Task<bool> EmailExistsAsync(string email, CancellationToken cancellationToken)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        return dbContext.Users.AnyAsync(x => x.Email == normalizedEmail, cancellationToken);
    }

    public Task<bool> GstExistsAsync(string gstNumber, CancellationToken cancellationToken)
    {
        var normalizedGst = gstNumber.Trim().ToUpperInvariant();
        return dbContext.DealerProfiles.AnyAsync(x => x.GstNumber == normalizedGst, cancellationToken);
    }

    public async Task<(IReadOnlyList<User> Items, int TotalCount)> GetAgentsAsync(int page, int pageSize, string? search, CancellationToken cancellationToken)
    {
        var baseQuery = dbContext.Users
            .Where(x => x.Role == UserRole.Agent)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            if (Enum.TryParse<UserStatus>(search, ignoreCase: true, out var statusFilter))
            {
                baseQuery = baseQuery.Where(x => x.Status == statusFilter);
            }
            else
            {
                var term = search.Trim().ToLowerInvariant();
                baseQuery = baseQuery.Where(x =>
                    x.FullName.ToLower().Contains(term) ||
                    x.Email.ToLower().Contains(term) ||
                    x.PhoneNumber.ToLower().Contains(term));
            }
        }

        var query = baseQuery.OrderByDescending(x => x.CreatedAtUtc);

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }

    public async Task<(IReadOnlyList<User> Items, int TotalCount)> GetDealersAsync(int page, int pageSize, string? search, CancellationToken cancellationToken)
    {
        var baseQuery = dbContext.Users
            .Include(x => x.DealerProfile)
            .Where(x => x.Role == UserRole.Dealer)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            if (Enum.TryParse<UserStatus>(search, ignoreCase: true, out var statusFilter))
            {
                baseQuery = baseQuery.Where(x => x.Status == statusFilter);
            }
            else
            {
                var term = search.Trim().ToLowerInvariant();
                baseQuery = baseQuery.Where(x =>
                    x.FullName.ToLower().Contains(term) ||
                    x.Email.ToLower().Contains(term) ||
                    (x.DealerProfile != null && x.DealerProfile.BusinessName.ToLower().Contains(term)));
            }
        }

        var query = baseQuery.OrderByDescending(x => x.CreatedAtUtc);

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }

    public async Task AddRefreshTokenAsync(RefreshToken refreshToken, CancellationToken cancellationToken)
    {
        await dbContext.RefreshTokens.AddAsync(refreshToken, cancellationToken);
    }

    public Task<RefreshToken?> GetValidRefreshTokenAsync(string tokenHash, CancellationToken cancellationToken)
    {
        return dbContext.RefreshTokens.FirstOrDefaultAsync(
            x => x.TokenHash == tokenHash && !x.IsRevoked && x.ExpiresAtUtc > DateTime.UtcNow,
            cancellationToken);
    }

    public Task<RefreshToken?> GetRefreshTokenAsync(string tokenHash, CancellationToken cancellationToken)
    {
        return dbContext.RefreshTokens.FirstOrDefaultAsync(x => x.TokenHash == tokenHash, cancellationToken);
    }

    public async Task AddOtpRecordAsync(OtpRecord otpRecord, CancellationToken cancellationToken)
    {
        await dbContext.OtpRecords.AddAsync(otpRecord, cancellationToken);
    }

    public Task<OtpRecord?> GetValidOtpAsync(Guid userId, string otpHash, CancellationToken cancellationToken)
    {
        return dbContext.OtpRecords.FirstOrDefaultAsync(
            x => x.UserId == userId && x.OtpHash == otpHash && !x.IsUsed && x.ExpiresAtUtc > DateTime.UtcNow,
            cancellationToken);
    }

    public async Task AddOutboxMessageAsync(string eventType, object payload, CancellationToken cancellationToken)
    {
        var message = new OutboxMessage
        {
            MessageId = Guid.NewGuid(),
            EventType = eventType,
            Payload = JsonSerializer.Serialize(payload),
            Status = OutboxStatus.Pending,
            CreatedAtUtc = DateTime.UtcNow
        };

        await dbContext.OutboxMessages.AddAsync(message, cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        return dbContext.SaveChangesAsync(cancellationToken);
    }
}
