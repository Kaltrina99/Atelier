using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.SimpleEmailV2;
using Starter.Api.Common.Email;
using Starter.Api.Common.Storage;

namespace Starter.Api.Common.Aws;

public static class AwsExtensions
{
    /// <summary>
    /// Wires storage and email. Each AWS service switches on when its config is filled in;
    /// otherwise a local implementation is used so the app always runs.
    ///   S3  → Aws:Region + Aws:S3:BucketName        (else files on local disk)
    ///   SES → Aws:Region + Aws:Ses:FromAddress      (else emails are written to the log)
    /// </summary>
    public static IServiceCollection AddAwsIntegrations(this IServiceCollection services, IConfiguration config)
    {
        var aws = config.GetSection(AwsOptions.Section).Get<AwsOptions>() ?? new AwsOptions();
        services.AddSingleton(aws);
        services.Configure<LocalStorageOptions>(config.GetSection(LocalStorageOptions.Section));

        // ── File storage ──
        if (aws.HasRegion && !string.IsNullOrWhiteSpace(aws.S3.BucketName))
        {
            services.AddSingleton<IAmazonS3>(_ => Create(aws, new AmazonS3Config { ForcePathStyle = !string.IsNullOrWhiteSpace(aws.ServiceUrl) },
                (c, cfg) => c is null ? new AmazonS3Client(cfg) : new AmazonS3Client(c, cfg)));
            services.AddSingleton<IFileStorage, S3FileStorage>();
        }
        else
        {
            services.AddSingleton<IFileStorage, LocalFileStorage>();
        }

        // ── Email ──
        if (aws.HasRegion && !string.IsNullOrWhiteSpace(aws.Ses.FromAddress))
        {
            services.AddSingleton<IAmazonSimpleEmailServiceV2>(_ => Create(aws, new AmazonSimpleEmailServiceV2Config(),
                (c, cfg) => c is null ? new AmazonSimpleEmailServiceV2Client(cfg) : new AmazonSimpleEmailServiceV2Client(c, cfg)));
            services.AddSingleton<IEmailSender, SesEmailSender>();
        }
        else
        {
            services.AddSingleton<IEmailSender, LogEmailSender>();
        }

        return services;
    }

    /// <summary>Same credential/region/endpoint rules for every AWS client.</summary>
    private static TClient Create<TConfig, TClient>(AwsOptions aws, TConfig cfg, Func<AWSCredentials?, TConfig, TClient> factory)
        where TConfig : ClientConfig
    {
        if (!string.IsNullOrWhiteSpace(aws.ServiceUrl))
        {
            cfg.ServiceURL = aws.ServiceUrl;
            cfg.AuthenticationRegion = aws.Region;
        }
        else
        {
            cfg.RegionEndpoint = RegionEndpoint.GetBySystemName(aws.Region);
        }

        // Keys in config → use them. No keys → SDK default chain (env vars, ~/.aws profile, IAM role).
        var credentials = aws.HasKeys ? new BasicAWSCredentials(aws.AccessKey, aws.SecretKey) : null;
        return factory(credentials, cfg);
    }
}
