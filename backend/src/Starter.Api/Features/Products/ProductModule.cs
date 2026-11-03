using Microsoft.AspNetCore.Http.HttpResults;

namespace Starter.Api.Features.Products;

public sealed class ProductModule : IFeatureModule
{
    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/products").WithTags("Products");

        group.MapGet("/", GetAll);
        group.MapGet("/{id:guid}", GetById).WithName("GetProductById");
        group.MapPost("/", Create).Validate<ProductRequest>();
        group.MapPut("/{id:guid}", Update).Validate<ProductRequest>();
        group.MapDelete("/{id:guid}", Delete);
    }

    private static async Task<Ok<PagedResult<ProductResponse>>> GetAll(
        [AsParameters] PageQuery page, AppDbContext db, CancellationToken ct)
    {
        var query = db.Set<Product>().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(page.Search))
            query = query.Where(x => x.Name.Contains(page.Search));

        var result = await query
            .OrderByDescending(x => x.CreatedAt)
            .ToPagedAsync(page, ProductResponse.Projection, ct);

        return TypedResults.Ok(result);
    }

    private static async Task<Results<Ok<ProductResponse>, NotFound>> GetById(
        Guid id, AppDbContext db, CancellationToken ct)
    {
        var item = await db.Set<Product>().AsNoTracking()
            .Where(x => x.Id == id)
            .Select(ProductResponse.Projection)
            .FirstOrDefaultAsync(ct);

        return item is null ? TypedResults.NotFound() : TypedResults.Ok(item);
    }

    private static async Task<CreatedAtRoute<ProductResponse>> Create(
        ProductRequest request, AppDbContext db, CancellationToken ct)
    {
        var entity = request.ToEntity();
        db.Add(entity);
        await db.SaveChangesAsync(ct);

        return TypedResults.CreatedAtRoute(ProductResponse.From(entity), "GetProductById", new { id = entity.Id });
    }

    private static async Task<Results<Ok<ProductResponse>, NotFound>> Update(
        Guid id, ProductRequest request, AppDbContext db, CancellationToken ct)
    {
        var entity = await db.Set<Product>().FindAsync([id], ct);
        if (entity is null) return TypedResults.NotFound();

        request.ApplyTo(entity);
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(ProductResponse.From(entity));
    }

    private static async Task<Results<NoContent, NotFound>> Delete(
        Guid id, AppDbContext db, CancellationToken ct)
    {
        var deleted = await db.Set<Product>().Where(x => x.Id == id).ExecuteDeleteAsync(ct);
        return deleted == 0 ? TypedResults.NotFound() : TypedResults.NoContent();
    }
}
