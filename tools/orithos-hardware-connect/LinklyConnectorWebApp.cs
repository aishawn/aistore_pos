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
        var settings = ConnectorLocalSettings.Load();
        var autoApproveMs = int.TryParse(Environment.GetEnvironmentVariable("CONNECTOR_AUTO_APPROVE_MS"), out var parsedMs)
            ? Math.Max(0, parsedMs)
            : 800;

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
            ctx.Response.Headers["Access-Control-Allow-Origin"] = "*";
            ctx.Response.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
            ctx.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type";
            if (HttpMethods.IsOptions(ctx.Request.Method))
            {
                ctx.Response.StatusCode = StatusCodes.Status204NoContent;
                return;
            }

            await next();
        });

        app.MapGet("/v1/health", () => Results.Json(new { ok = true }, json));

        app.MapGet("/v1/status", () =>
        {
            var hasToken = settings.HasConnectorToken();
            return Results.Json(new
            {
                linklyClient = hasToken ? "simulated-ready" : "waiting-for-token",
                terminal = "ready",
                tokenConfigured = hasToken,
                detail = hasToken
                    ? "Ready for Orithos test payments on this PC."
                    : "Save EFTPOS in Hardware settings — token syncs automatically (Hardware Connect 1.1.1+).",
            }, json);
        });

        app.MapPost("/v1/config", async (HttpRequest request) =>
        {
            var body = await JsonSerializer.DeserializeAsync<ConnectorConfigRequest>(request.Body, json, cancellationToken);
            if (body is null)
            {
                return Results.BadRequest(new { error = "Invalid JSON" });
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

            var snap = settings.Snapshot();
            _ = Task.Run(async () =>
            {
                if (autoApproveMs > 0)
                {
                    await Task.Delay(autoApproveMs, cancellationToken);
                }

                await PostCallbackAsync(
                    snap.ApiUrl,
                    snap.Token,
                    body.AttemptId,
                    body.ConnectorChallenge,
                    "APPROVED",
                    $"LAB-QUERY-{body.AttemptId}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                    cancellationToken);
            }, cancellationToken);

            return Results.Json(new { queried = true, attemptId = body.AttemptId }, json, statusCode: StatusCodes.Status202Accepted);
        });

        app.MapPost("/v1/purchase", async (HttpRequest request) =>
        {
            var body = await JsonSerializer.DeserializeAsync<ConnectorTxnRequest>(request.Body, json, cancellationToken);
            if (body?.AttemptId is not > 0 || string.IsNullOrWhiteSpace(body.ConnectorChallenge))
            {
                return Results.BadRequest(new { error = "attemptId and connectorChallenge are required" });
            }

            var snap = settings.Snapshot();
            _ = Task.Run(async () =>
            {
                if (autoApproveMs > 0)
                {
                    await Task.Delay(autoApproveMs, cancellationToken);
                }

                await PostCallbackAsync(
                    snap.ApiUrl,
                    snap.Token,
                    body.AttemptId,
                    body.ConnectorChallenge,
                    "APPROVED",
                    $"LAB-{body.AttemptId}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                    cancellationToken);
            }, cancellationToken);

            return Results.Json(new { accepted = true, orderUuid = body.OrderUuid }, json, statusCode: StatusCodes.Status202Accepted);
        });

        await app.RunAsync(cancellationToken);
    }

    private static async Task PostCallbackAsync(
        string orithosApiUrl,
        string connectorToken,
        long attemptId,
        string connectorChallenge,
        string status,
        string providerReference,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(connectorToken))
        {
            return;
        }

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"{orithosApiUrl}/api/eftpos/connector/callback");
            request.Headers.TryAddWithoutValidation("X-Orithos-Connector-Token", connectorToken);
            request.Content = JsonContent.Create(new
            {
                attemptId,
                connectorChallenge,
                status,
                providerReference,
            });
            using var response = await CallbackClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var text = await response.Content.ReadAsStringAsync(cancellationToken);
                Console.Error.WriteLine($"Orithos callback failed ({(int)response.StatusCode}): {text}");
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Orithos callback error: {ex.Message}");
        }
    }

    private sealed record ConnectorConfigRequest(string? OrithosApiUrl, string? ConnectorToken);

    private sealed record ConnectorTxnRequest(long AttemptId, string? OrderUuid, string? ConnectorChallenge);
}