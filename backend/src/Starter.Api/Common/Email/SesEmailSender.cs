using Amazon.SimpleEmailV2;
using Amazon.SimpleEmailV2.Model;
using Starter.Api.Common.Aws;

namespace Starter.Api.Common.Email;

public sealed class SesEmailSender(IAmazonSimpleEmailServiceV2 ses, AwsOptions aws) : IEmailSender
{
    public string Provider => $"Amazon SES ({aws.Ses.FromAddress})";

    public Task SendAsync(EmailMessage m, CancellationToken ct = default)
    {
        var from = string.IsNullOrWhiteSpace(aws.Ses.FromName)
            ? aws.Ses.FromAddress
            : $"\"{aws.Ses.FromName}\" <{aws.Ses.FromAddress}>";

        return ses.SendEmailAsync(new SendEmailRequest
        {
            FromEmailAddress = from,
            Destination = new Destination { ToAddresses = [m.To] },
            Content = new EmailContent
            {
                Simple = new Message
                {
                    Subject = new Content { Data = m.Subject },
                    Body = new Body
                    {
                        Html = new Content { Data = m.HtmlBody },
                        Text = m.TextBody is null ? null : new Content { Data = m.TextBody },
                    },
                },
            },
        }, ct);
    }
}
