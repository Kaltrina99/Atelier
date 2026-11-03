using Scalar.AspNetCore;
using Starter.Api.Common.Aws;
using Starter.Api.Common.Errors;
using Starter.Api.Features.Auth;

var builder = WebApplication.CreateBuilder(args);

// ── Infrastructure ────────────────────────────────────────────────
builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlServer(builder.Configuration.GetConnectionString("Default"),
        sql => sql.EnableRetryOnFailure())); // survives brief network/Azure/RDS blips

builder.Services.AddValidatorsFromAssemblyContaining<Program>();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddOpenApi();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [])
    .AllowAnyHeader()
    .AllowAnyMethod()));

// ── AWS: S3 + SES switch on when their settings are filled in (see appsettings.json "Aws") ──
builder.Services.AddAwsIntegrations(builder.Configuration);

// ── Features (auto-discovered: every class implementing IFeatureModule) ──
builder.Services.AddFeatureModules();

var app = builder.Build();

app.UseExceptionHandler();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(); // UI at /scalar
}

// Applies pending EF migrations (creates the database if it doesn't exist).
// On by default in Development; for production prefer a deploy step (see README).
if (app.Configuration.GetValue<bool>("Database:MigrateOnStartup"))
    await app.Services.MigrateDatabaseAsync();

await AuthBootstrap.EnsureOwnerAsync(app.Services, app.Configuration);
app.MapGet("/api/health", () => TypedResults.Ok(new { status = "ok" })).WithTags("System");
app.MapFeatureModules();

app.Run();

// Exposed for integration tests (WebApplicationFactory<Program>)
public partial class Program;
