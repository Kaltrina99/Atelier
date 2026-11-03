using Microsoft.AspNetCore.Http.HttpResults;
using Starter.Api.Common.Storage;

namespace Starter.Api.Features.Files;

/// <summary>Upload / list / download / delete files through IFileStorage (S3 or local disk).</summary>
public sealed class FilesModule : IFeatureModule
{
    private const long MaxBytes = 25 * 1024 * 1024;

    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/files").WithTags("Files");

        group.MapGet("/", List);
        group.MapPost("/", Upload).DisableAntiforgery(); // add auth before exposing publicly
        group.MapGet("/download", Download);
        group.MapDelete("/", Delete);
    }

    private static async Task<Ok<IReadOnlyList<StoredFile>>> List(IFileStorage storage, CancellationToken ct)
        => TypedResults.Ok(await storage.ListAsync("uploads/", ct));

    private static async Task<Results<Created<StoredFile>, ValidationProblem>> Upload(
        IFormFile file, IFileStorage storage, CancellationToken ct)
    {
        if (file.Length == 0 || file.Length > MaxBytes)
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["file"] = [$"Choose a file between 1 byte and {MaxBytes / 1024 / 1024} MB."]
            });

        await using var stream = file.OpenReadStream();
        var stored = await storage.SaveAsync(StorageKeys.NewUploadKey(file.FileName), stream, file.ContentType, ct);
        return TypedResults.Created($"/api/files/download?key={Uri.EscapeDataString(stored.Key)}", stored);
    }

    // S3: redirects to a short-lived presigned URL. Local: streams the file.
    private static async Task<IResult> Download(string key, IFileStorage storage, CancellationToken ct)
    {
        if (await storage.GetDownloadUrlAsync(key, ct) is { } url) return TypedResults.Redirect(url);

        var file = await storage.OpenAsync(key, ct);
        return file is null
            ? TypedResults.NotFound()
            : TypedResults.Stream(file.Stream, file.ContentType, file.FileName);
    }

    private static async Task<NoContent> Delete(string key, IFileStorage storage, CancellationToken ct)
    {
        await storage.DeleteAsync(key, ct);
        return TypedResults.NoContent();
    }
}
