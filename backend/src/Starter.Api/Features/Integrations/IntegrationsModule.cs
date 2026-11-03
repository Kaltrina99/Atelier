using Microsoft.AspNetCore.Http.HttpResults;
using Starter.Api.Common.Aws;
using Starter.Api.Common.Email;
using Starter.Api.Common.Storage;

namespace Starter.Api.Features.Integrations;

/// <summary>Shows which providers are active and lets you check email delivery.</summary>
public sealed class IntegrationsModule : IFeatureModule
{
    public sealed record IntegrationStatus(string Storage, string Email, string? Region, string Credentials);
    public sealed record TestEmailRequest(string To);

    public sealed class TestEmailValidator : AbstractValidator<TestEmailRequest>
    {
        public TestEmailValidator() => RuleFor(x => x.To).NotEmpty().EmailAddress();
    }

    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/integrations").WithTags("Integrations");

        group.MapGet("/", (IFileStorage storage, IEmailSender email, AwsOptions aws) =>
            TypedResults.Ok(new IntegrationStatus(
                storage.Provider,
                email.Provider,
                aws.HasRegion ? aws.Region : null,
                aws.HasKeys ? "Access keys from configuration" : "AWS default chain (env vars, profile or IAM role)")));

        group.MapPost("/test-email", async Task<Results<Ok<string>, ProblemHttpResult>> (
            TestEmailRequest req, IEmailSender email, CancellationToken ct) =>
        {
            try
            {
                await email.SendAsync(new EmailMessage(req.To, "Test email",
                    "<p>Email delivery is working.</p>", "Email delivery is working."), ct);
                return TypedResults.Ok($"Sent via {email.Provider}");
            }
            catch (Exception e)
            {
                return TypedResults.Problem(e.Message, title: "Sending failed", statusCode: 502);
            }
        }).Validate<TestEmailRequest>();
    }
}
