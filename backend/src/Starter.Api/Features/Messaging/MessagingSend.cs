using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Starter.Api.Features.Messaging;

public sealed class MessagingSend : Entity
{
    public Guid StoreId { get; set; }
    public Guid CollectionId { get; set; }
    public Guid ReminderId { get; set; }
    public required string Channel { get; set; }
    public required string Status { get; set; }
    public string? ProviderMessageId { get; set; }
    public string? Error { get; set; }
    public int Attempt { get; set; }
}

internal sealed class MessagingSendConfiguration : IEntityTypeConfiguration<MessagingSend>
{
    public void Configure(EntityTypeBuilder<MessagingSend> builder)
    {
        builder.ToTable("MessagingSends");
        builder.HasKey(send => send.Id);
        builder.Property(send => send.Channel).HasMaxLength(20).IsRequired();
        builder.Property(send => send.Status).HasMaxLength(20).IsRequired();
        builder.Property(send => send.ProviderMessageId).HasMaxLength(200);
        builder.Property(send => send.Error).HasMaxLength(1000);
        builder.HasIndex(send => new { send.StoreId, send.CollectionId, send.ReminderId, send.Channel }).IsUnique();
        builder.HasIndex(send => new { send.StoreId, send.CreatedAt });
    }
}
