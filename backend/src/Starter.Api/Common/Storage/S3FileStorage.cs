using Amazon.S3;
using Amazon.S3.Model;
using Starter.Api.Common.Aws;

namespace Starter.Api.Common.Storage;

public sealed class S3FileStorage(IAmazonS3 s3, AwsOptions aws) : IFileStorage
{
    private string Bucket => aws.S3.BucketName;
    private string Prefix => aws.S3.KeyPrefix.Trim('/') is { Length: > 0 } p ? p + "/" : "";

    public string Provider => $"Amazon S3 ({Bucket})";

    public async Task<StoredFile> SaveAsync(string key, Stream content, string contentType, CancellationToken ct = default)
    {
        await s3.PutObjectAsync(new PutObjectRequest
        {
            BucketName = Bucket,
            Key = Prefix + key,
            InputStream = content,
            ContentType = contentType,
        }, ct);
        return new StoredFile(key, StorageKeys.FileNameOf(key), content.CanSeek ? content.Length : 0, DateTime.UtcNow);
    }

    public async Task<IReadOnlyList<StoredFile>> ListAsync(string? prefix = null, CancellationToken ct = default)
    {
        var files = new List<StoredFile>();
        var request = new ListObjectsV2Request { BucketName = Bucket, Prefix = Prefix + (prefix ?? "") };
        ListObjectsV2Response response;
        do
        {
            response = await s3.ListObjectsV2Async(request, ct);
            foreach (var o in response.S3Objects ?? [])
            {
                var key = o.Key[Prefix.Length..];
                files.Add(new StoredFile(key, StorageKeys.FileNameOf(key), o.Size ?? 0, o.LastModified?.ToUniversalTime() ?? default));
            }
            request.ContinuationToken = response.NextContinuationToken;
        } while (response.IsTruncated == true);

        return files.OrderByDescending(f => f.LastModified).ToList();
    }

    public async Task<FileContent?> OpenAsync(string key, CancellationToken ct = default)
    {
        try
        {
            var o = await s3.GetObjectAsync(Bucket, Prefix + key, ct);
            return new FileContent(o.ResponseStream, o.Headers.ContentType ?? "application/octet-stream", StorageKeys.FileNameOf(key));
        }
        catch (AmazonS3Exception e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public Task DeleteAsync(string key, CancellationToken ct = default)
        => s3.DeleteObjectAsync(Bucket, Prefix + key, ct);

    public async Task<string?> GetDownloadUrlAsync(string key, CancellationToken ct = default)
        => await s3.GetPreSignedURLAsync(new GetPreSignedUrlRequest
        {
            BucketName = Bucket,
            Key = Prefix + key,
            Expires = DateTime.UtcNow.AddMinutes(aws.S3.PresignedUrlMinutes),
            Protocol = aws.ServiceUrl?.StartsWith("http://") == true ? Protocol.HTTP : Protocol.HTTPS,
            ResponseHeaderOverrides = { ContentDisposition = $"attachment; filename=\"{StorageKeys.FileNameOf(key)}\"" },
        });
}
