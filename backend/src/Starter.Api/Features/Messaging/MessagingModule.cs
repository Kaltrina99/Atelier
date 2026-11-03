using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Starter.Api.Features.Auth;

namespace Starter.Api.Features.Messaging;

public sealed class MessagingModule : IFeatureModule
{
    private const int MaximumRecipientsPerSend = 50;

    private sealed record SendRequest(Guid CollectionId, string Channel, Guid[] ReminderIds, string Language);
    private sealed record Recipient(Guid Id, string Name, string Phone);
    private sealed record SendResult(Guid ReminderId, string CustomerName, string Status, string? MessageId);
    private sealed record ProviderOutcome(string? MessageId, string GroupName);
    private sealed record SendResponse(string Channel, IReadOnlyList<SendResult> Results);
    private sealed record CampaignStatus(Guid ReminderId, string Status, string? MessageId, int Attempt, DateTime UpdatedAt);

    public void AddServices(IServiceCollection services) => services.AddHttpClient();

    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        var messaging = app.MapGroup("/api/messaging").RequireAuthorization();
        messaging.MapGet("/status", GetStatus);
        messaging.MapGet("/campaign/{collectionId:guid}/{channel}", GetCampaignStatus).RequireAuthorization("StoreOwner");
        messaging.MapPost("/send", Send).RequireAuthorization("StoreOwner");
    }

    private static IResult GetStatus(IConfiguration configuration)
    {
        var hasBaseUrl = TryGetBaseUri(configuration, out _);
        return TypedResults.Ok(new
        {
            provider = "Infobip",
            whatsapp = new
            {
                configured = hasBaseUrl
                    && Has(configuration, "Messaging:Infobip:ApiKey")
                    && Has(configuration, "Messaging:WhatsApp:Sender")
                    && Has(configuration, "Messaging:WhatsApp:TemplateName")
                    && Has(configuration, "Messaging:WhatsApp:Language"),
                requirements = new[] { "API key", "WhatsApp sender", "approved marketing template", "template language" },
            },
            viber = new
            {
                configured = hasBaseUrl
                    && Has(configuration, "Messaging:Infobip:ApiKey")
                    && Has(configuration, "Messaging:Viber:Sender"),
                requirements = new[] { "API key", "approved Viber sender", "Viber destination approval" },
            },
        });
    }

    private static async Task<IResult> GetCampaignStatus(
        Guid collectionId, string channel, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        if (!TryStoreId(principal, out var storeId)) return TypedResults.Unauthorized();
        channel = channel.Trim().ToLowerInvariant();
        if (channel is not ("whatsapp" or "viber"))
            return TypedResults.Problem("Choose WhatsApp or Viber.", statusCode: 400);
        var sends = await db.Set<MessagingSend>().AsNoTracking()
            .Where(item => item.StoreId == storeId && item.CollectionId == collectionId && item.Channel == channel)
            .Select(item => new CampaignStatus(item.ReminderId, item.Status, item.ProviderMessageId, item.Attempt, item.UpdatedAt))
            .ToListAsync(ct);
        return TypedResults.Ok(sends);
    }

    private static async Task<IResult> Send(
        SendRequest request,
        ClaimsPrincipal principal,
        AppDbContext db,
        IHttpClientFactory clients,
        IConfiguration configuration,
        CancellationToken ct)
    {
        if (!TryStoreId(principal, out var storeId)) return TypedResults.Unauthorized();
        var channel = request.Channel?.Trim().ToLowerInvariant();
        if (channel is not ("whatsapp" or "viber"))
            return TypedResults.Problem("Choose WhatsApp or Viber.", statusCode: 400);
        if (request.CollectionId == Guid.Empty || request.ReminderIds is not { Length: > 0 and <= MaximumRecipientsPerSend })
            return TypedResults.Problem($"Choose between 1 and {MaximumRecipientsPerSend} recipients.", statusCode: 400);
        if (request.ReminderIds.Distinct().Count() != request.ReminderIds.Length)
            return TypedResults.Problem("A recipient can only be selected once.", statusCode: 400);
        if (!TryGetBaseUri(configuration, out var baseUri))
            return TypedResults.Problem("The Infobip HTTPS base URL is not configured.", statusCode: 503);

        var apiKey = configuration["Messaging:Infobip:ApiKey"];
        var sender = configuration[channel == "whatsapp" ? "Messaging:WhatsApp:Sender" : "Messaging:Viber:Sender"];
        var template = configuration["Messaging:WhatsApp:TemplateName"];
        var language = configuration["Messaging:WhatsApp:Language"];
        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(sender)
            || (channel == "whatsapp" && (string.IsNullOrWhiteSpace(template) || string.IsNullOrWhiteSpace(language))))
            return TypedResults.Problem($"The Infobip {channel} integration is not fully configured.", statusCode: 503);

        var store = await db.Set<StoreState>().SingleOrDefaultAsync(item => item.StoreId == storeId, ct);
        if (store is null) return TypedResults.NotFound("The store has no saved collection data.");

        JsonDocument document;
        try { document = JsonDocument.Parse(store.Data); }
        catch (JsonException) { return TypedResults.Problem("Saved store data is not valid JSON.", statusCode: 500); }

        using (document)
        {
            if (!TryGetCollection(document.RootElement, request.CollectionId, out var collection))
                return TypedResults.NotFound("The selected collection was not found.");
            var reminders = ReadRecipients(collection, channel);
            var selected = request.ReminderIds.Select(id => reminders.GetValueOrDefault(id)).ToArray();
            if (selected.Any(recipient => recipient is null))
                return TypedResults.Problem(
                    channel == "viber"
                        ? "Each Viber recipient needs recorded Viber opt-in and confirmation that a non-promotional introduction was previously sent."
                        : "Each WhatsApp recipient needs recorded WhatsApp marketing opt-in.",
                    statusCode: 400);

            var collectionName = ReadString(collection, "name");
            if (string.IsNullOrWhiteSpace(collectionName))
                return TypedResults.Problem("The selected collection has no name.", statusCode: 400);
            var arrivalDate = ReadString(collection, "arrivalDate") ?? "";
            var productNames = ReadProductNames(document.RootElement, collection);
            var productList = productNames.Count == 0 ? "-" : string.Join(", ", productNames);

            var existing = await db.Set<MessagingSend>()
                .Where(item => item.StoreId == storeId
                    && item.CollectionId == request.CollectionId
                    && item.Channel == channel
                    && request.ReminderIds.Contains(item.ReminderId))
                .ToDictionaryAsync(item => item.ReminderId, ct);

            var sends = new List<MessagingSend>(selected.Length);
            foreach (var recipient in selected.Cast<Recipient>())
            {
                if (existing.TryGetValue(recipient.Id, out var prior))
                {
                    if (prior.Status is "Pending" or "Accepted" or "Unknown")
                        return TypedResults.Conflict($"A {channel} send for {recipient.Name} is already {prior.Status.ToLowerInvariant()}; it will not be sent again automatically.");
                    prior.Status = "Pending";
                    prior.Error = null;
                    prior.ProviderMessageId = null;
                    prior.Attempt++;
                    sends.Add(prior);
                }
                else
                {
                    var item = new MessagingSend
                    {
                        StoreId = storeId,
                        CollectionId = request.CollectionId,
                        ReminderId = recipient.Id,
                        Channel = channel,
                        Status = "Pending",
                        Attempt = 1,
                    };
                    db.Add(item);
                    sends.Add(item);
                }
            }

            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException)
            {
                return TypedResults.Conflict("Another send for this campaign is already in progress. Refresh the collection before retrying.");
            }

            var messageLanguage = request.Language == "en" ? "en" : "sq";
            var payload = channel == "whatsapp"
                ? CreateWhatsAppPayload(sender, template!, language!, collectionName, arrivalDate, productList, selected.Cast<Recipient>())
                : CreateViberPayload(sender, collectionName, arrivalDate, productList, ReadString(collection, "description"), messageLanguage, selected.Cast<Recipient>());
            var path = channel == "whatsapp" ? "whatsapp/1/message/template" : "viber/1/message/text";
            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, new Uri(baseUri, path));
            httpRequest.Headers.TryAddWithoutValidation("Authorization", $"App {apiKey}");
            httpRequest.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

            HttpResponseMessage response;
            string responseBody;
            try
            {
                response = await clients.CreateClient().SendAsync(httpRequest, ct);
                responseBody = await response.Content.ReadAsStringAsync(ct);
            }
            catch (HttpRequestException)
            {
                SetSendOutcome(sends, "Unknown", "Provider connection failed; check the provider dashboard before retrying.");
                await db.SaveChangesAsync(ct);
                return TypedResults.Problem("The provider connection failed. Check campaign status before retrying to avoid duplicate messages.", statusCode: 502);
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                SetSendOutcome(sends, "Unknown", "Provider request timed out; check the provider dashboard before retrying.");
                await db.SaveChangesAsync(ct);
                return TypedResults.Problem("The provider request timed out. Check campaign status before retrying to avoid duplicate messages.", statusCode: 502);
            }

            using (response)
            {
                if (!response.IsSuccessStatusCode)
                {
                    var status = (int)response.StatusCode >= 500 || (int)response.StatusCode == 408 ? "Unknown" : "Failed";
                    SetSendOutcome(sends, status, $"Provider returned HTTP {(int)response.StatusCode}.");
                    await db.SaveChangesAsync(ct);
                    return TypedResults.Problem(
                        status == "Unknown"
                            ? "The provider returned an uncertain result. Check its dashboard before retrying."
                            : "The provider rejected the send. Check the Infobip account, template, and sender configuration.",
                        statusCode: 502);
                }
            }

            Dictionary<string, ProviderOutcome> outcomes;
            try { outcomes = ReadProviderOutcomes(responseBody); }
            catch (JsonException)
            {
                SetSendOutcome(sends, "Unknown", "Provider accepted the request but returned an unreadable response.");
                await db.SaveChangesAsync(ct);
                return TypedResults.Problem("The provider response could not be verified. Check its dashboard before retrying.", statusCode: 502);
            }

            var results = new List<SendResult>(selected.Length);
            foreach (var recipient in selected.Cast<Recipient>())
            {
                var send = sends.Single(item => item.ReminderId == recipient.Id);
                if (outcomes.TryGetValue(recipient.Phone, out var outcome)
                    && !string.Equals(outcome.GroupName, "REJECTED", StringComparison.OrdinalIgnoreCase)
                    && !string.IsNullOrWhiteSpace(outcome.MessageId))
                {
                    send.Status = "Accepted";
                    send.ProviderMessageId = outcome.MessageId;
                    results.Add(new SendResult(recipient.Id, recipient.Name, "accepted", outcome.MessageId));
                }
                else if (outcomes.TryGetValue(recipient.Phone, out outcome)
                    && string.Equals(outcome.GroupName, "REJECTED", StringComparison.OrdinalIgnoreCase))
                {
                    send.Status = "Failed";
                    send.Error = "The provider rejected this recipient.";
                    results.Add(new SendResult(recipient.Id, recipient.Name, "failed", null));
                }
                else
                {
                    send.Status = "Unknown";
                    send.Error = "The provider response did not confirm acceptance or rejection.";
                    results.Add(new SendResult(recipient.Id, recipient.Name, "unknown", null));
                }
            }
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(new SendResponse(channel, results));
        }
    }

    private static object CreateWhatsAppPayload(
        string sender, string template, string language, string collectionName, string arrivalDate,
        string productList, IEnumerable<Recipient> recipients)
        => new
        {
            messages = recipients.Select(recipient => new
            {
                from = sender,
                to = recipient.Phone,
                content = new
                {
                    templateName = template,
                    templateData = new
                    {
                        body = new
                        {
                            type = "POSITIONAL_PARAMETERS",
                            placeholders = new[] { recipient.Name, collectionName, arrivalDate, productList },
                        },
                    },
                    language,
                },
            }),
        };

    private static object CreateViberPayload(
        string sender, string collectionName, string arrivalDate, string productList, string? description, string language,
        IEnumerable<Recipient> recipients)
        => new
        {
            messages = recipients.Select(recipient => new
            {
                from = sender,
                to = recipient.Phone,
                content = new
                {
                    text = language == "sq"
                        ? $"Përshëndetje {recipient.Name}, koleksioni ynë i ri \"{collectionName}\" ka ardhur"
                            + (string.IsNullOrWhiteSpace(arrivalDate) ? "." : $" më {arrivalDate}.")
                            + (productList == "-" ? "" : $" Modelet: {productList}.")
                            + (string.IsNullOrWhiteSpace(description) ? "" : $" {description.Trim()}")
                            + " Për të ndaluar njoftimet promocionale, kontaktoni dyqanin tonë."
                        : $"Hello {recipient.Name}, our new collection \"{collectionName}\" has arrived"
                            + (string.IsNullOrWhiteSpace(arrivalDate) ? "." : $" on {arrivalDate}.")
                            + (productList == "-" ? "" : $" Styles: {productList}.")
                            + (string.IsNullOrWhiteSpace(description) ? "" : $" {description.Trim()}")
                            + " To stop promotional messages, contact our store.",
                },
                label = "PROMOTIONAL",
            }),
        };

    private static Dictionary<string, ProviderOutcome> ReadProviderOutcomes(string response)
    {
        using var document = JsonDocument.Parse(response);
        var result = new Dictionary<string, ProviderOutcome>(StringComparer.Ordinal);
        if (document.RootElement.ValueKind != JsonValueKind.Object
            || !document.RootElement.TryGetProperty("messages", out var messages)
            || messages.ValueKind != JsonValueKind.Array)
            return result;

        foreach (var message in messages.EnumerateArray())
        {
            if (message.ValueKind != JsonValueKind.Object) continue;
            var phone = ReadString(message, "to");
            if (phone is null) continue;
            var id = message.TryGetProperty("messageId", out var messageId) && messageId.ValueKind == JsonValueKind.String
                ? messageId.GetString()
                : null;
            var groupName = message.TryGetProperty("status", out var status) && status.ValueKind == JsonValueKind.Object
                ? ReadString(status, "groupName") ?? ""
                : "";
            result[NormalizeNumber(phone)] = new ProviderOutcome(id, groupName);
        }
        return result;
    }

    private static Dictionary<Guid, Recipient> ReadRecipients(JsonElement collection, string channel)
    {
        var result = new Dictionary<Guid, Recipient>();
        if (!collection.TryGetProperty("reminders", out var reminders) || reminders.ValueKind != JsonValueKind.Array)
            return result;
        foreach (var reminder in reminders.EnumerateArray())
        {
            if (!Guid.TryParse(ReadString(reminder, "id"), out var id)) continue;
            var optedIn = ReadBoolean(reminder, channel == "whatsapp" ? "whatsappOptIn" : "viberOptIn");
            var viberIntroConfirmed = channel != "viber" || ReadBoolean(reminder, "viberIntroConfirmed");
            var phone = NormalizeNumber(ReadString(reminder, "phone") ?? "");
            if (!optedIn || !viberIntroConfirmed || phone.Length is < 8 or > 15) continue;
            result[id] = new Recipient(id, ReadString(reminder, "customerName") ?? "Customer", phone);
        }
        return result;
    }

    private static bool TryGetCollection(JsonElement root, Guid collectionId, out JsonElement collection)
    {
        if (root.TryGetProperty("collections", out var collections) && collections.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in collections.EnumerateArray())
            {
                if (Guid.TryParse(ReadString(item, "id"), out var id) && id == collectionId)
                {
                    collection = item;
                    return true;
                }
            }
        }
        collection = default;
        return false;
    }

    private static List<string> ReadProductNames(JsonElement root, JsonElement collection)
    {
        var names = new List<string>();
        if (!collection.TryGetProperty("productIds", out var ids) || ids.ValueKind != JsonValueKind.Array
            || !root.TryGetProperty("products", out var products) || products.ValueKind != JsonValueKind.Array)
            return names;
        var selectedIds = ids.EnumerateArray().Where(item => item.ValueKind == JsonValueKind.String)
            .Select(item => item.GetString()).ToHashSet(StringComparer.Ordinal);
        foreach (var product in products.EnumerateArray())
        {
            if (selectedIds.Contains(ReadString(product, "id")))
            {
                var name = ReadString(product, "name");
                if (!string.IsNullOrWhiteSpace(name)) names.Add(name);
            }
        }
        return names;
    }

    private static string? ReadString(JsonElement element, string property)
        => element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static bool ReadBoolean(JsonElement element, string property)
        => element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.True;

    private static string NormalizeNumber(string value)
    {
        var digits = Regex.Replace(value, @"\D", "");
        if (digits.StartsWith("00", StringComparison.Ordinal)) digits = digits[2..];
        if (digits.StartsWith('0')) digits = $"383{digits[1..]}";
        else if (!digits.StartsWith("383", StringComparison.Ordinal)) digits = $"383{digits}";
        return digits;
    }

    private static void SetSendOutcome(IEnumerable<MessagingSend> sends, string status, string error)
    {
        foreach (var send in sends)
        {
            send.Status = status;
            send.Error = error;
        }
    }

    private static bool Has(IConfiguration configuration, string key)
        => !string.IsNullOrWhiteSpace(configuration[key]);

    private static bool TryGetBaseUri(IConfiguration configuration, out Uri baseUri)
    {
        var value = configuration["Messaging:Infobip:BaseUrl"]?.Trim().TrimEnd('/');
        if (Uri.TryCreate(value, UriKind.Absolute, out var parsed) && parsed.Scheme == Uri.UriSchemeHttps)
        {
            baseUri = new Uri($"{parsed.AbsoluteUri}/", UriKind.Absolute);
            return true;
        }
        baseUri = new Uri("https://invalid.invalid/");
        return false;
    }

    private static bool TryStoreId(ClaimsPrincipal principal, out Guid storeId)
        => Guid.TryParse(principal.FindFirstValue("store_id"), out storeId);
}
