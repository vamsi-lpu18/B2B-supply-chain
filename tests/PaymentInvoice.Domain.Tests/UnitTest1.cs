using PaymentInvoice.Domain.Entities;
using PaymentInvoice.Domain.Enums;

namespace PaymentInvoice.Domain.Tests;

public sealed class PaymentInvoiceDomainTests
{
    [Fact]
    public void DealerCreditAccount_AddAndReduceOutstanding_UpdatesAvailableCredit()
    {
        var account = DealerCreditAccount.Create(Guid.NewGuid(), 10000m);

        account.AddOutstanding(2500m);
        account.ReduceOutstanding(500m);

        Assert.Equal(2000m, account.CurrentOutstanding);
        Assert.Equal(8000m, account.AvailableCredit);
    }

    [Fact]
    public void InvoiceCreate_Interstate_SetsIgstType()
    {
        var invoice = Invoice.Create(Guid.NewGuid(), Guid.NewGuid(), "INV-1", "idem-1", isInterstate: true);

        Assert.Equal(GstType.IGST, invoice.GstType);
    }

    [Fact]
    public void Invoice_AddLine_RecalculatesTotals()
    {
        var invoice = Invoice.Create(Guid.NewGuid(), Guid.NewGuid(), "INV-2", "idem-2", isInterstate: false);

        invoice.AddLine(Guid.NewGuid(), "Product A", "sku-1", "8517", 2, 100m);
        invoice.AddLine(Guid.NewGuid(), "Product B", "sku-2", "8517", 1, 50m);

        Assert.Equal(250m, invoice.Subtotal);
        Assert.Equal(45m, invoice.GstAmount);
        Assert.Equal(295m, invoice.GrandTotal);
    }

    [Fact]
    public void InvoiceWorkflowState_Update_ClampsReminderCountAndTrimsNote()
    {
        var state = InvoiceWorkflowState.CreateDefault(Guid.NewGuid(), DateTime.UtcNow.AddDays(-1));

        state.Update(
            InvoiceWorkflowStatus.Escalated,
            DateTime.UtcNow.AddDays(5),
            DateTime.UtcNow.AddDays(2),
            DateTime.UtcNow.AddDays(1),
            "  escalation note  ",
            reminderCount: 500,
            lastReminderAtUtc: DateTime.UtcNow);

        Assert.Equal(InvoiceWorkflowStatus.Escalated, state.Status);
        Assert.Equal(99, state.ReminderCount);
        Assert.Equal("escalation note", state.InternalNote);
    }
}
