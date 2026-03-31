namespace SharedKernel.Abstractions;

public abstract record ValueObject
{
    protected abstract IEnumerable<object?> GetEqualityComponents();

    public override int GetHashCode()
    {
        return GetEqualityComponents()
            .Aggregate(1, (current, obj) => HashCode.Combine(current, obj));
    }
}
