using PaymentInvoice.Domain.Enums;

namespace PaymentInvoice.Domain.Entities;

public sealed class InvoiceWorkflowState
{
    private InvoiceWorkflowState()
    {
    }

    public Guid InvoiceId { get; private set; }
    public InvoiceWorkflowStatus Status { get; private set; } = InvoiceWorkflowStatus.Pending;
    public DateTime DueAtUtc { get; private set; }
    public DateTime? PromiseToPayAtUtc { get; private set; }
    public DateTime? NextFollowUpAtUtc { get; private set; }
    public string InternalNote { get; private set; } = string.Empty;
    public int ReminderCount { get; private set; }
    public DateTime? LastReminderAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; } = DateTime.UtcNow;

    public static InvoiceWorkflowState CreateDefault(Guid invoiceId, DateTime invoiceCreatedAtUtc)
    {
        var baseDate = invoiceCreatedAtUtc == default ? DateTime.UtcNow : invoiceCreatedAtUtc;
        var dueAtUtc = baseDate.AddDays(7);

        return new InvoiceWorkflowState
        {
            InvoiceId = invoiceId,
            Status = InvoiceWorkflowStatus.Pending,
            DueAtUtc = DateTime.SpecifyKind(dueAtUtc, DateTimeKind.Utc),
            InternalNote = string.Empty,
            ReminderCount = 0,
            UpdatedAtUtc = DateTime.UtcNow
        };
    }

    public void Update(
        InvoiceWorkflowStatus status,
        DateTime dueAtUtc,
        DateTime? promiseToPayAtUtc,
        DateTime? nextFollowUpAtUtc,
        string internalNote,
        int reminderCount,
        DateTime? lastReminderAtUtc)
    {
        Status = status;
        DueAtUtc = ToUtcOrNow(dueAtUtc);
        PromiseToPayAtUtc = ToUtcOrNull(promiseToPayAtUtc);
        NextFollowUpAtUtc = ToUtcOrNull(nextFollowUpAtUtc);
        InternalNote = (internalNote ?? string.Empty).Trim();
        ReminderCount = Math.Clamp(reminderCount, 0, 99);
        LastReminderAtUtc = ToUtcOrNull(lastReminderAtUtc);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    private static DateTime ToUtcOrNow(DateTime value)
    {
        if (value == default)
        {
            return DateTime.UtcNow;
        }

        if (value.Kind == DateTimeKind.Utc)
        {
            return value;
        }

        return value.ToUniversalTime();
    }

    private static DateTime? ToUtcOrNull(DateTime? value)
    {
        if (value is null || value == default)
        {
            return null;
        }

        if (value.Value.Kind == DateTimeKind.Utc)
        {
            return value.Value;
        }

        return value.Value.ToUniversalTime();
    }
}