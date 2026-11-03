namespace Starter.Api.Common.Aws;

/// <summary>
/// Bound from the "Aws" section of configuration.
/// Leave AccessKey/SecretKey empty on AWS-hosted environments (ECS, EC2, Lambda, App Runner):
/// the SDK then uses the IAM role automatically.
/// </summary>
public sealed class AwsOptions
{
    public const string Section = "Aws";

    /// <summary>e.g. eu-central-2 (Zurich), eu-central-1 (Frankfurt)</summary>
    public string Region { get; set; } = "";
    public string? AccessKey { get; set; }
    public string? SecretKey { get; set; }

    /// <summary>Optional: point at LocalStack / MinIO / a test endpoint instead of real AWS.</summary>
    public string? ServiceUrl { get; set; }

    public S3Settings S3 { get; set; } = new();
    public SesSettings Ses { get; set; } = new();

    public bool HasKeys => !string.IsNullOrWhiteSpace(AccessKey) && !string.IsNullOrWhiteSpace(SecretKey);
    public bool HasRegion => !string.IsNullOrWhiteSpace(Region);

    public sealed class S3Settings
    {
        public string BucketName { get; set; } = "";
        /// <summary>Optional folder inside the bucket, e.g. "my-app/" — lets several apps share one bucket.</summary>
        public string KeyPrefix { get; set; } = "";
        public int PresignedUrlMinutes { get; set; } = 15;
    }

    public sealed class SesSettings
    {
        /// <summary>Must be a verified identity in SES.</summary>
        public string FromAddress { get; set; } = "";
        public string? FromName { get; set; }
    }
}
