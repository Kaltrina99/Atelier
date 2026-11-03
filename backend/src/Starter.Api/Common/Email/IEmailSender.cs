namespace Starter.Api.Common.Email;

public sealed record EmailMessage(string To, string Subject, string HtmlBody, string? TextBody = null);

/// <summary>Inject this anywhere you need to send mail. SES or log output is decided by configuration.</summary>
public interface IEmailSender
{
    string Provider { get; }
    Task SendAsync(EmailMessage message, CancellationToken ct = default);
}
