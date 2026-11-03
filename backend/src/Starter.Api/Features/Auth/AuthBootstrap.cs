using Microsoft.AspNetCore.Identity;

namespace Starter.Api.Features.Auth;

public static class AuthBootstrap
{
    public static async Task EnsureOwnerAsync(IServiceProvider services, IConfiguration configuration, CancellationToken ct = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (await db.Set<StoreUser>().AnyAsync(ct)) return;

        var email = configuration["StoreAuth:BootstrapEmail"]?.Trim().ToLowerInvariant();
        var password = configuration["StoreAuth:BootstrapPassword"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password) || password.Length < 12)
            throw new InvalidOperationException(
                "The store has no owner account. Set StoreAuth__BootstrapEmail and StoreAuth__BootstrapPassword (at least 12 characters), then restart.");
        if (!new System.ComponentModel.DataAnnotations.EmailAddressAttribute().IsValid(email))
            throw new InvalidOperationException("StoreAuth__BootstrapEmail must be a valid email address.");

        var owner = new StoreUser
        {
            Email = email,
            PasswordHash = "",
            Role = "Owner",
            StoreId = Guid.CreateVersion7(),
        };
        owner.PasswordHash = scope.ServiceProvider.GetRequiredService<IPasswordHasher<StoreUser>>()
            .HashPassword(owner, password);
        db.Add(owner);
        await db.SaveChangesAsync(ct);
    }
}
