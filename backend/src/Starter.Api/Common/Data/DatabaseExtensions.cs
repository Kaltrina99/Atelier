namespace Starter.Api.Common.Data;

public static class DatabaseExtensions
{
    /// <summary>
    /// Applies any pending EF Core migrations. Creates the database on first run.
    /// Never drops anything: schema changes only happen through migrations you generate
    /// (dotnet ef migrations add ...) and can review in the Migrations folder.
    /// </summary>
    public static async Task MigrateDatabaseAsync(this IServiceProvider services)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Database");

        try
        {
            var pending = (await db.Database.GetPendingMigrationsAsync()).ToList();
            if (pending.Count == 0) return;

            logger.LogInformation("Applying {Count} migration(s): {Migrations}", pending.Count, string.Join(", ", pending));
            await db.Database.MigrateAsync();
        }
        catch (Exception e) when (e is Microsoft.Data.SqlClient.SqlException or InvalidOperationException)
        {
            logger.LogCritical(
                "Could not reach SQL Server for '{Database}'. Check ConnectionStrings:Default and that the server is running. {Error}",
                db.Database.GetDbConnection().Database, SqlErrorOf(e));
            throw;
        }
    }

    private static string SqlErrorOf(Exception e)
    {
        for (var x = e; x is not null; x = x.InnerException)
            if (x is Microsoft.Data.SqlClient.SqlException sql) return sql.Message;
        return e.Message;
    }
}
