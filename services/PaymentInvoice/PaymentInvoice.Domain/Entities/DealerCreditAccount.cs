namespace PaymentInvoice.Domain.Entities;

public sealed class DealerCreditAccount
{
    private DealerCreditAccount()
    {
    }

    public Guid AccountId { get; private set; } = Guid.NewGuid();
    public Guid DealerId { get; private set; }
    public decimal CreditLimit { get; private set; } = 500000m;
    public decimal CurrentOutstanding { get; private set; }
    public decimal AvailableCredit => CreditLimit - CurrentOutstanding;

    public static DealerCreditAccount Create(Guid dealerId, decimal? initialCreditLimit = null)
    {
        return new DealerCreditAccount
        {
            DealerId = dealerId,
            CreditLimit = initialCreditLimit ?? 500000m
        };
    }

    public void UpdateCreditLimit(decimal creditLimit)
    {
        CreditLimit = creditLimit;
    }

    public void AddOutstanding(decimal amount)
    {
        CurrentOutstanding += amount;
    }

    public void ReduceOutstanding(decimal amount)
    {
        CurrentOutstanding = Math.Max(0m, CurrentOutstanding - amount);
    }
}
