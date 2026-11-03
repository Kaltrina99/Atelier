namespace Starter.Api.Common.Storage;

public sealed record StoredFile(string Key, string FileName, long Size, DateTime LastModified);

public sealed record FileContent(Stream Stream, string ContentType, string FileName);

/// <summary>Inject this anywhere you need files. S3 or local disk is decided by configuration.</summary>
public interface IFileStorage
{
    /// <summary>Shown on the Integrations page, e.g. "Amazon S3 (my-bucket)".</summary>
    string Provider { get; }

    Task<StoredFile> SaveAsync(string key, Stream content, string contentType, CancellationToken ct = default);
    Task<IReadOnlyList<StoredFile>> ListAsync(string? prefix = null, CancellationToken ct = default);
    Task<FileContent?> OpenAsync(string key, CancellationToken ct = default);
    Task DeleteAsync(string key, CancellationToken ct = default);

    /// <summary>A short-lived direct-download URL, or null if the provider streams through the API.</summary>
    Task<string?> GetDownloadUrlAsync(string key, CancellationToken ct = default);
}

public static class StorageKeys
{
    /// <summary>Builds a unique, safe key like "uploads/2026/11/0192…-report.pdf".</summary>
    public static string NewUploadKey(string fileName)
    {
        var safe = string.Concat(Path.GetFileName(fileName).Select(c => char.IsLetterOrDigit(c) || c is '.' or '-' or '_' ? c : '-'));
        return $"uploads/{DateTime.UtcNow:yyyy/MM}/{Guid.CreateVersion7():N}-{safe}";
    }

    /// <summary>Recovers the original file name from a key made by NewUploadKey.</summary>
    public static string FileNameOf(string key)
    {
        var name = key[(key.LastIndexOf('/') + 1)..];
        var dash = name.IndexOf('-');
        return dash == 32 ? name[(dash + 1)..] : name;
    }

    public static string ContentTypeOf(string fileName)
        => new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider().TryGetContentType(fileName, out var type)
            ? type : "application/octet-stream";
}
