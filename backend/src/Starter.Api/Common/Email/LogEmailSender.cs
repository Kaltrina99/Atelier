namespace Starter.Api.Common.Email;

/// <summary>Fallback when SES is not configured: emails are written to the log instead of sent.</summary>
public sealed class LogEmailSender(ILogger<LogEmailSender> logger) : IEmailSender
{
    public string Provider => "Log only (not sent)";

    public Task SendAsync(EmailMessage m, CancellationToken ct = default)
    {
        logger.LogInformation("EMAIL (not sent) → {To} | {Subject}\n{Body}", m.To, m.Subject, m.TextBody ?? m.HtmlBody);
        return Task.CompletedTask;
    }
}
