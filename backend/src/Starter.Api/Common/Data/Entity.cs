namespace Starter.Api.Common.Data;

/// <summary>Base class for every persisted entity. Id + audit timestamps are handled for you.</summary>
public abstract class Entity
{
    public Guid Id { get; init; } = Guid.CreateVersion7();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
