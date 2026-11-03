using System.Reflection;

namespace Starter.Api.Common.Endpoints;

public static class FeatureModuleExtensions
{
    private static readonly List<IFeatureModule> Modules = [];

    /// <summary>Finds every IFeatureModule in this assembly and lets it register services.</summary>
    public static IServiceCollection AddFeatureModules(this IServiceCollection services)
    {
        var modules = Assembly.GetExecutingAssembly().GetTypes()
            .Where(t => t is { IsClass: true, IsAbstract: false } && typeof(IFeatureModule).IsAssignableFrom(t))
            .Select(t => (IFeatureModule)Activator.CreateInstance(t)!);

        foreach (var module in modules)
        {
            module.AddServices(services);
            Modules.Add(module);
        }
        return services;
    }

    public static WebApplication MapFeatureModules(this WebApplication app)
    {
        foreach (var module in Modules) module.MapEndpoints(app);
        return app;
    }
}
