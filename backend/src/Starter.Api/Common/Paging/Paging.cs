using System.Linq.Expressions;

namespace Starter.Api.Common.Paging;

public sealed record PageQuery(int Page = 1, int PageSize = 20, string? Search = null)
{
    public int SafePage => Math.Max(1, Page);
    public int SafePageSize => Math.Clamp(PageSize, 1, 100);
}

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount)
{
    public int TotalPages => (int)Math.Ceiling(TotalCount / (double)PageSize);
}

public static class PagingExtensions
{
    public static async Task<PagedResult<TOut>> ToPagedAsync<TIn, TOut>(
        this IQueryable<TIn> query, PageQuery page,
        Expression<Func<TIn, TOut>> selector, CancellationToken ct)
    {
        var total = await query.CountAsync(ct);
        var items = await query
            .Skip((page.SafePage - 1) * page.SafePageSize)
            .Take(page.SafePageSize)
            .Select(selector)
            .ToListAsync(ct);
        return new PagedResult<TOut>(items, page.SafePage, page.SafePageSize, total);
    }
}
