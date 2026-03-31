namespace CatalogInventory.Domain.Entities;

public sealed class Category
{
    private Category()
    {
    }

    public Guid CategoryId { get; private set; } = Guid.NewGuid();
    public string Name { get; private set; } = string.Empty;
    public Guid? ParentCategoryId { get; private set; }
    public Category? ParentCategory { get; private set; }
    public ICollection<Category> Children { get; private set; } = new List<Category>();

    public static Category Create(string name, Guid? parentCategoryId = null)
    {
        return new Category
        {
            Name = name.Trim(),
            ParentCategoryId = parentCategoryId
        };
    }
}
