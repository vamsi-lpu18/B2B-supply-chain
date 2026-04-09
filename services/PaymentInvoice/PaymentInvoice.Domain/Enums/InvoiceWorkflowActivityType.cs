namespace PaymentInvoice.Domain.Enums;

public enum InvoiceWorkflowActivityType
{
    WorkflowSaved = 0,
    ReminderSent = 1,
    PromiseToPay = 2,
    MarkedPaid = 3,
    MarkedDisputed = 4,
    Escalated = 5,
    AutoFollowUp = 6
}