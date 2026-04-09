using PaymentInvoice.Domain.Enums;

namespace PaymentInvoice.Domain.Entities;

public sealed class InvoiceWorkflowActivity
{
    private InvoiceWorkflowActivity()
    {
    }

    public Guid ActivityId { get; private set; } = Guid.NewGuid();
    public Guid InvoiceId { get; private set; }
    public InvoiceWorkflowActivityType Type { get; private set; }
    public string Message { get; private set; } = string.Empty;
    public string CreatedByRole { get; private set; } = "System";
    public DateTime CreatedAtUtc { get; private set; } = DateTime.UtcNow;

    public static InvoiceWorkflowActivity Create(Guid invoiceId, InvoiceWorkflowActivityType type, string message, string createdByRole)
    {
        return new InvoiceWorkflowActivity
        {
            ActivityId = Guid.NewGuid(),
            InvoiceId = invoiceId,
            Type = type,
            Message = (message ?? string.Empty).Trim(),
            CreatedByRole = string.IsNullOrWhiteSpace(createdByRole) ? "System" : createdByRole.Trim(),
            CreatedAtUtc = DateTime.UtcNow
        };
    }
}