using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Starter.Api.Features.Auth;

public sealed class StoreState : Entity
{
    public Guid StoreId { get; set; }
    public required string Data { get; set; }
    public byte[] Version { get; set; } = [];
}

internal sealed class StoreStateConfiguration : IEntityTypeConfiguration<StoreState>
{
    public void Configure(EntityTypeBuilder<StoreState> b)
    {
        b.ToTable("StoreStates");
        b.HasKey(x => x.Id);
        b.Property(x => x.Data).IsRequired();
        b.Property(x => x.Version).IsRowVersion();
        b.HasIndex(x => x.StoreId).IsUnique();
    }
}
