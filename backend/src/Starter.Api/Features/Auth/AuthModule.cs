using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;

namespace Starter.Api.Features.Auth;

public sealed class AuthModule : IFeatureModule
{
    private const int TokenHours = 8;

    public sealed record LoginRequest(string Email, string Password);
    public sealed record StaffRequest(string Email, string Password);
    public sealed record LoginResponse(string Token, string Email, string Role, DateTime ExpiresAt);
    public sealed record StoreResponse(string Data, string Version);
    public sealed record StoreRequest(string Data, string Version);

    public void AddServices(IServiceCollection services)
    {
        services.AddScoped<IPasswordHasher<StoreUser>, PasswordHasher<StoreUser>>();
        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<IConfiguration>((options, configuration) =>
            {
                var signingKey = configuration["StoreAuth:SigningKey"];
                if (string.IsNullOrWhiteSpace(signingKey) || Encoding.UTF8.GetByteCount(signingKey) < 32)
                    throw new InvalidOperationException("Set StoreAuth__SigningKey to a random secret of at least 32 bytes.");

                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = configuration["StoreAuth:Issuer"] ?? "atelier-api",
                    ValidateAudience = true,
                    ValidAudience = configuration["StoreAuth:Audience"] ?? "atelier-store",
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                };
            });
        services.AddAuthorization(options => options.AddPolicy("StoreOwner", policy => policy.RequireRole("Owner")));
    }

    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/api/auth").WithTags("Authentication");
        auth.MapPost("/login", Login);
        auth.MapPost("/staff", AddStaff).RequireAuthorization("StoreOwner");
        auth.MapGet("/me", (ClaimsPrincipal user) => TypedResults.Ok(new
        {
            email = user.FindFirstValue(ClaimTypes.Email),
            role = user.FindFirstValue(ClaimTypes.Role),
        })).RequireAuthorization();

        var store = app.MapGroup("/api/store").WithTags("Store data").RequireAuthorization();
        store.MapGet("/", GetStore);
        store.MapPut("/", SaveStore);
    }

    private static async Task<Results<Ok<LoginResponse>, UnauthorizedHttpResult, ProblemHttpResult>> Login(
        LoginRequest request, AppDbContext db, IPasswordHasher<StoreUser> hasher, IConfiguration configuration, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return TypedResults.Unauthorized();

        var email = request.Email.Trim().ToLowerInvariant();
        var user = await db.Set<StoreUser>().SingleOrDefaultAsync(x => x.Email == email, ct);
        if (user is null || hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
            return TypedResults.Unauthorized();

        var expiresAt = DateTime.UtcNow.AddHours(TokenHours);
        var token = CreateToken(user, expiresAt, configuration);
        return TypedResults.Ok(new LoginResponse(token, user.Email, user.Role, expiresAt));
    }

    private static async Task<Results<Created<string>, Conflict<string>, ProblemHttpResult>> AddStaff(
        StaffRequest request, ClaimsPrincipal principal, AppDbContext db, IPasswordHasher<StoreUser> hasher, CancellationToken ct)
    {
        var email = request.Email?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email) || email.Length > 320 || !new System.ComponentModel.DataAnnotations.EmailAddressAttribute().IsValid(email))
            return TypedResults.Problem("Enter a valid email address.", statusCode: 400);
        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 12)
            return TypedResults.Problem("Staff passwords must be at least 12 characters.", statusCode: 400);
        if (await db.Set<StoreUser>().AnyAsync(x => x.Email == email, ct))
            return TypedResults.Conflict("An account already uses that email.");

        if (!Guid.TryParse(principal.FindFirstValue("store_id"), out var storeId))
            return TypedResults.Problem("Store identity is missing.", statusCode: 401);

        var user = new StoreUser { Email = email, PasswordHash = "", Role = "Staff", StoreId = storeId };
        user.PasswordHash = hasher.HashPassword(user, request.Password);
        db.Add(user);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return TypedResults.Conflict("An account already uses that email.");
        }
        return TypedResults.Created($"/api/auth/staff/{user.Id}", user.Email);
    }

    private static async Task<Results<Ok<StoreResponse>, UnauthorizedHttpResult>> GetStore(
        ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        if (!TryStoreId(principal, out var storeId)) return TypedResults.Unauthorized();
        var store = await db.Set<StoreState>().AsNoTracking().SingleOrDefaultAsync(x => x.StoreId == storeId, ct);
        return store is null
            ? TypedResults.Ok(new StoreResponse("null", ""))
            : TypedResults.Ok(new StoreResponse(store.Data, Convert.ToBase64String(store.Version)));
    }

    private static async Task<Results<Ok<StoreResponse>, UnauthorizedHttpResult, Conflict<string>, ProblemHttpResult>> SaveStore(
        StoreRequest request, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        if (!TryStoreId(principal, out var storeId)) return TypedResults.Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Data))
            return TypedResults.Problem("Store data is required.", statusCode: 400);
        if (request.Data.Length > 20_000_000)
            return TypedResults.Problem("Store data exceeds the 20 MB limit.", statusCode: 413);

        StoreState? store;
        if (string.IsNullOrEmpty(request.Version))
        {
            store = await db.Set<StoreState>().SingleOrDefaultAsync(x => x.StoreId == storeId, ct);
            if (store is not null) return TypedResults.Conflict("Store data changed in another session. Reload the page before saving.");
            store = new StoreState { StoreId = storeId, Data = request.Data };
            db.Add(store);
        }
        else
        {
            byte[] expectedVersion;
            try { expectedVersion = Convert.FromBase64String(request.Version); }
            catch (FormatException) { return TypedResults.Problem("Invalid store version.", statusCode: 400); }

            store = await db.Set<StoreState>().SingleOrDefaultAsync(x => x.StoreId == storeId, ct);
            if (store is null) return TypedResults.Conflict("Store data was removed. Reload the page before saving.");
            db.Entry(store).Property(x => x.Version).OriginalValue = expectedVersion;
            store.Data = request.Data;
        }

        try
        {
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(new StoreResponse(store.Data, Convert.ToBase64String(store.Version)));
        }
        catch (DbUpdateConcurrencyException)
        {
            return TypedResults.Conflict("Store data changed in another session. Reload the page before saving.");
        }
    }

    private static bool TryStoreId(ClaimsPrincipal principal, out Guid storeId)
        => Guid.TryParse(principal.FindFirstValue("store_id"), out storeId);

    private static string CreateToken(StoreUser user, DateTime expiresAt, IConfiguration configuration)
    {
        var signingKey = configuration["StoreAuth:SigningKey"]!;
        var issuer = configuration["StoreAuth:Issuer"] ?? "atelier-api";
        var audience = configuration["StoreAuth:Audience"] ?? "atelier-store";
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("store_id", user.StoreId.ToString()),
        };
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(issuer, audience, claims, DateTime.UtcNow, expiresAt, credentials);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
