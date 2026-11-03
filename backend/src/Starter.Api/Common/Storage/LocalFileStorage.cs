using Microsoft.Extensions.Options;

namespace Starter.Api.Common.Storage;

public sealed class LocalStorageOptions
{
    public const string Section = "Storage";
    public string LocalPath { get; set; } = "App_Data/files";
}

/// <summary>Fallback when S3 is not configured: files go to a folder next to the app.</summary>
public sealed class LocalFileStorage(IOptions<LocalStorageOptions> options, IHostEnvironment env) : IFileStorage
{
    private readonly string _root = Path.GetFullPath(Path.Combine(env.ContentRootPath, options.Value.LocalPath));

    public string Provider => "Local disk";

    private string PathOf(string key)
    {
        var full = Path.GetFullPath(Path.Combine(_root, key));
        if (!full.StartsWith(_root + Path.DirectorySeparatorChar)) throw new ArgumentException("Invalid file key.");
        return full;
    }

    public async Task<StoredFile> SaveAsync(string key, Stream content, string contentType, CancellationToken ct = default)
    {
        var path = PathOf(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using (var file = File.Create(path)) await content.CopyToAsync(file, ct);
        var info = new FileInfo(path);
        return new StoredFile(key, StorageKeys.FileNameOf(key), info.Length, info.LastWriteTimeUtc);
    }

    public Task<IReadOnlyList<StoredFile>> ListAsync(string? prefix = null, CancellationToken ct = default)
    {
        if (!Directory.Exists(_root)) return Task.FromResult<IReadOnlyList<StoredFile>>([]);
        IReadOnlyList<StoredFile> files = new DirectoryInfo(_root)
            .EnumerateFiles("*", SearchOption.AllDirectories)
            .Select(f => Path.GetRelativePath(_root, f.FullName).Replace('\\', '/') is var key
                ? new StoredFile(key, StorageKeys.FileNameOf(key), f.Length, f.LastWriteTimeUtc) : null!)
            .Where(f => prefix is null || f.Key.StartsWith(prefix))
            .OrderByDescending(f => f.LastModified)
            .ToList();
        return Task.FromResult(files);
    }

    public Task<FileContent?> OpenAsync(string key, CancellationToken ct = default)
    {
        var path = PathOf(key);
        if (!File.Exists(path)) return Task.FromResult<FileContent?>(null);
        var name = StorageKeys.FileNameOf(key);
        return Task.FromResult<FileContent?>(new FileContent(File.OpenRead(path), StorageKeys.ContentTypeOf(name), name));
    }

    public Task DeleteAsync(string key, CancellationToken ct = default)
    {
        File.Delete(PathOf(key));
        return Task.CompletedTask;
    }

    public Task<string?> GetDownloadUrlAsync(string key, CancellationToken ct = default) => Task.FromResult<string?>(null);
}
