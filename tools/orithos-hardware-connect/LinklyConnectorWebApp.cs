using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Orithos.HardwareConnect;

/// <summary>Local EFTPOS bridge on 9167 — same register agent as receipt printing (9170).</summary>
internal static class LinklyConnectorWebApp
{
    private static readonly HttpClient CallbackClient = new() { Timeout = TimeSpan.FromSeconds(30) };

    public static async Task RunAsync(CancellationToken cancellationToken)
    {
        var listenUrl = Environment.GetEnvironmentVariable("ORITHOS_CONNECTOR_URL")
            ?? AgentVersion.DefaultEftposListen;
        if (!IsLoopbackListenUrl(listenUrl))
        {
            throw new InvalidOperationException("ORITHOS_CONNECTOR_URL must use localhost or a loopback IP address.");
        }

        var settings = ConnectorLocalSettings.Load();

        var json = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            PropertyNameCaseInsensitive = true,
        };

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls(listenUrl);
        var app = builder.Build();

        app.Use(async (ctx, next) =>
        {
            var origin = ctx.Request.Headers["Origin"].ToString();
            if (!string.IsNullOrEmpty(origin) && !IsAllowedOrigin(origin))
            {
                ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                return;
            }

            if (!string.IsNullOrEmpty(origin))
            {
                ctx.Response.Headers["Access-Control-Allow-Origin"] = origin;
                ctx.Response.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
                ctx.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type";
                ctx.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
                ctx.Response.Headers["Vary"] = "Origin";
            }

            if (HttpMethods.IsOptions(ctx.Request.Method))
            {
                if (string.IsNullOrEmpty(origin))
                {
                    ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                    return;
                }

                ctx.Response.StatusCode = StatusCodes.Status204NoContent;
                return;
            }

            if (HttpMethods.IsPost(ctx.Request.Method)
                && ctx.Request.Path.Equals("/v1/config", StringComparison.OrdinalIgnoreCase)
                && string.IsNullOrEmpty(origin))
            {
                ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                return;
            }

            await next();
        });

        app.MapGet("/v1/health", () => Results.Json(new { ok = true }, json));

        var linklyTcpBase = (Environment.GetEnvironmentVariable("ORITHOS_LINKLY_TCP_BASE") ?? "").Trim().TrimEnd('/');
        var linklyMode = string.IsNullOrWhiteSpace(linklyTcpBase) ? "lab" : "tcp-proxy";

        app.MapGet("/v1/status", () =>
        {
            var hasToken = settings.HasConnectorToken();
            return Results.Json(new
            {
                linklyClient = hasToken
                    ? (linklyMode == "tcp-proxy" ? "tcp-proxy" : "simulated-ready")
                    : "waiting-for-token",
                terminal = linklyMode == "tcp-proxy" ? "linkly-tcp" : "ready",
                tokenConfigured = hasToken,
                integrationMode = linklyMode,
                detail = !hasToken
                    ? "Save EFTPOS in Hardware settings — token syncs automatically (Hardware Connect 1.1.1+)."
                    : linklyMode == "tcp-proxy"
                        ? "Forwarding to the configured Linkly HTTP adapter. Verify terminal pairing before accepting payments."
                        : "Lab mode is diagnostic only; it cannot approve or process Sell payments. Configure the real Linkly adapter first.",
            }, json);
        });

        app.MapPost("/v1/config", async (HttpRequest request) =>
        {
            var body = await JsonSerializer.DeserializeAsync<ConnectorConfigRequest>(request.Body, json, cancellationToken);
            if (body is null)
            {
                return Results.BadRequest(new { error = "Invalid JSON" });
            }

            if (!Uri.TryCreate(body.OrithosApiUrl, UriKind.Absolute, out var apiUri)
                || !IsAllowedOrigin(apiUri.GetLeftPart(UriPartial.Authority))
                || !string.Equals(request.Headers["Origin"].ToString(), apiUri.GetLeftPart(UriPartial.Authority), StringComparison.OrdinalIgnoreCase))
            {
                return Results.BadRequest(new { error = "Orithos API origin must match this approved store page" });
            }

            settings.Apply(body.OrithosApiUrl, body.ConnectorToken, persist: true);
            var hasToken = settings.HasConnectorToken();
            return Results.Json(new { saved = true, tokenConfigured = hasToken }, json);
        });

        app.MapPost("/v1/query", async (HttpRequest request) =>
        {
            var body = await JsonSerializer.DeserializeAsync<ConnectorTxnRequest>(request.Body, json, cancellationToken);
            if (body?.AttemptId is not > 0 || string.IsNullOrWhiteSpace(body.ConnectorChallenge))
            {
                return Results.BadRequest(new { error = "attemptId and connectorChallenge are required" });
            }

            if (!settings.HasConnectorToken())
            {
                return Results.Problem("Connector token is not configured. Save EFTPOS settings in Hardware Connect before querying a transaction.", statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            if (string.IsNullOrWhiteSpace(linklyTcpBase))
            {
                return Results.Problem("Lab mode cannot query terminal payments. Configure the real Linkly adapter before reconciling this attempt.", statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            var forwarded = await TryForwardToLinklyTcpAsync(linklyTcpBase, "/v1/query", body!, json, cancellationToken);
            return forwarded!;
        });

        app.MapPost("/v1/purchase", async (HttpRequest request) =>
        {
            var body = await JsonSerializer.DeserializeAsync<ConnectorTxnRequest>(request.Body, json, cancellationToken);
            if (body?.AttemptId is not > 0 || string.IsNullOrWhiteSpace(body.ConnectorChallenge))
            {
                return Results.BadRequest(new { error = "attemptId and connectorChallenge are required" });
            }

            if (body.AmountCents is not > 0 || !string.Equals(body.Currency, "AUD", StringComparison.OrdinalIgnoreCase))
            {
                return Results.BadRequest(new { error = "A positive amountCents and AUD currency are required" });
            }

            if (!settings.HasConnectorToken())
            {
                return Results.Problem("Connector token is not configured. Save EFTPOS settings in Hardware Connect before starting a payment.", statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            if (string.IsNullOrWhiteSpace(linklyTcpBase))
            {
                return Results.Problem("Lab mode cannot approve or process Sell payments. Configure the real Linkly adapter before enabling card payments.", statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            body = body with { Currency = "AUD" };
            var forwarded = await TryForwardToLinklyTcpAsync(linklyTcpBase, "/v1/purchase", body, json, cancellationToken);
            return forwarded!;
        });

        await app.RunAsync(cancellationToken);
    }

    private static bool IsLoopbackListenUrl(string value)
    {
        return Uri.TryCreate(value, UriKind.Absolute, out var uri)
            && (uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
                || (IPAddress.TryParse(uri.Host, out var address) && IPAddress.IsLoopback(address)));
    }

    private static bool IsAllowedOrigin(string origin)
    {
        var configured = Environment.GetEnvironmentVariable("ORITHOS_ALLOWED_ORIGINS") ?? "";
        var allowed = new[]
        {
            "https://skr.orithos.com.au",
            "https://demo.orithos.com.au",
            "https://app.orithos.com.au",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3100",
            "http://127.0.0.1:3100",
            "http://localhost:3101",
            "http://127.0.0.1:3101",
        }.Concat(configured.Split([',', ';'], StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries));

        return allowed.Any(candidate => string.Equals(candidate, origin, StringComparison.OrdinalIgnoreCase));
    }

    private static async Task<IResult?> TryForwardToLinklyTcpAsync(
        string linklyTcpBase,
        string path,
        ConnectorTxnRequest body,
        JsonSerializerOptions json,
        CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"{linklyTcpBase}{path}");
            request.Content = JsonContent.Create(body, options: json);
            using var response = await CallbackClient.SendAsync(request, cancellationToken);
            var text = await response.Content.ReadAsStringAsync(cancellationToken);
            return Results.Content(text, "application/json", statusCode: (int)response.StatusCode);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Linkly HTTP adapter forward failed: {ex.GetType().Name}");
            return Results.Problem("No confirmation was received from the Linkly adapter. The outcome may be unknown; do not retry until the terminal and Linkly journal are checked.", statusCode: StatusCodes.Status502BadGateway);
        }
    }

    private sealed record ConnectorConfigRequest(string? OrithosApiUrl, string? ConnectorToken);

    private sealed record ConnectorTxnRequest(
        long AttemptId,
        string? OrderUuid,
        string? ConnectorChallenge,
        int? AmountCents = null,
        string? Currency = null);
}
