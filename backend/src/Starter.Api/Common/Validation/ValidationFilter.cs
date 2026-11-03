namespace Starter.Api.Common.Validation;

/// <summary>Runs the FluentValidation validator for T before the endpoint executes.</summary>
public sealed class ValidationFilter<T>(IValidator<T> validator) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var model = ctx.Arguments.OfType<T>().FirstOrDefault();
        if (model is null) return await next(ctx);

        var result = await validator.ValidateAsync(model, ctx.HttpContext.RequestAborted);
        return result.IsValid
            ? await next(ctx)
            : TypedResults.ValidationProblem(result.ToDictionary());
    }
}

public static class ValidationExtensions
{
    /// <summary>Usage: group.MapPost("/", Create).Validate&lt;CreateXRequest&gt;();</summary>
    public static RouteHandlerBuilder Validate<T>(this RouteHandlerBuilder builder)
        => builder.AddEndpointFilter<ValidationFilter<T>>().ProducesValidationProblem();
}
