namespace PaymentInvoice.Domain.Enums;

public enum InvoiceWorkflowStatus
{
    Pending = 0,
    ReminderSent = 1,
    PromiseToPay = 2,
    Paid = 3,
    Disputed = 4,
    Escalated = 5
}