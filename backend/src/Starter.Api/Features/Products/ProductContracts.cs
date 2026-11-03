using System.Linq.Expressions;

namespace Starter.Api.Features.Products;

// ── What the API returns ──
public sealed record ProductResponse(
    Guid Id, string Name, string? Description, decimal Price, bool IsActive,
    DateTime CreatedAt, DateTime UpdatedAt)
{
    // Expression (not a method) so EF translates it to SQL.
    public static readonly Expression<Func<Product, ProductResponse>> Projection = x =>
        new(x.Id, x.Name, x.Description, x.Price, x.IsActive, x.CreatedAt, x.UpdatedAt);

    private static readonly Func<Product, ProductResponse> Map = Projection.Compile();
    public static ProductResponse From(Product x) => Map(x);
}

// ── What the API accepts (same shape for create + update) ──
public sealed record ProductRequest(string Name, string? Description, decimal Price, bool IsActive)
{
    public Product ToEntity() => new() { Name = Name, Description = Description, Price = Price, IsActive = IsActive };

    public void ApplyTo(Product x)
    {
        x.Name = Name;
        x.Description = Description;
        x.Price = Price;
        x.IsActive = IsActive;
    }
}

public sealed class ProductRequestValidator : AbstractValidator<ProductRequest>
{
    public ProductRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(2000);
        RuleFor(x => x.Price).GreaterThanOrEqualTo(0);
    }
}
