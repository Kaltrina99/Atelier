namespace Starter.Api.Common.Endpoints;

/// <summary>
/// One per feature folder. Implement it and the feature is wired up automatically —
/// no edits to Program.cs needed.
/// </summary>
public interface IFeatureModule
{
    /// <summary>Register feature-specific services (optional).</summary>
    void AddServices(IServiceCollection services) { }

    /// <summary>Map the feature's HTTP endpoints.</summary>
    void MapEndpoints(IEndpointRouteBuilder app);
}
