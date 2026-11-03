using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Starter.Api.Features.Auth;

public sealed class StoreUser : Entity
{
    public required string Email { get; set; }
    public required string PasswordHash { get; set; }
    public required string Role { get; set; }
    public Guid StoreId { get; set; }
}

internal sealed class StoreUserConfiguration : IEntityTypeConfiguration<StoreUser>
{
    public void Configure(EntityTypeBuilder<StoreUser> b)
    {
        b.ToTable("StoreUsers");
        b.HasKey(x => x.Id);
        b.Property(x => x.Email).HasMaxLength(320).IsRequired();
        b.Property(x => x.PasswordHash).HasMaxLength(1000).IsRequired();
        b.Property(x => x.Role).HasMaxLength(20).IsRequired();
        b.HasIndex(x => x.Email).IsUnique();
        b.HasIndex(x => x.StoreId);
    }
}
