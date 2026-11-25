using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Orithos.HardwareConnect;

/// <summary>Local EFTPOS bridge on 9167 — same register agent as receipt printing (9170).</summary>
internal static class LinklyConnectorWebApp
{
    private static readonly HttpClient CallbackClient = new(new HttpClientHandler { AllowAutoRedirect = false })
    {
        Timeout = TimeSpan.FromSeconds(30),
    };

    public static Task RunAsync(CancellationToken cancellationToken) => RunAsync(cancellationToken, null);

    public static async Task RunAsync(CancellationToken cancellationToken, Action? onStarted)
    {
        var listenUrl = Environment.GetEnvironmentVariable("ORITHOS_CONNECTOR_URL")
            ?? AgentVersion.DefaultEftposListen;
        if (!LocalRequestSecurity.IsLoopbackListenUrl(listenUrl))
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
        builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 1_048_576);
        builder.WebHost.UseUrls(listenUrl);
        await using var app = builder.Build();

        app.Use(async (ctx, next) =>
        {
            var origin = ctx.Request.Headers["Origin"].ToString();
            if (!string.IsNullOrEmpty(origin) && !LocalRequestSecurity.IsAllowedOrigin(origin))
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

        app.MapGet("/v1/health", () => Results.Json(new
        {
            ok = true,
            product = AgentVersion.Product,
            version = AgentVersion.DisplayVersion,
        }, json));

        // The adapter is a local HTTP contract. Keep the old variable as a migration alias.
        var configuredLinklyBase = LinklyAdapterEndpoint.ResolveConfiguredBase(
            Environment.GetEnvironmentVariable("ORITHOS_LINKLY_ADAPTER_BASE"),
            Environment.GetEnvironmentVariable("ORITHOS_LINKLY_TCP_BASE"));
        var linklyAdapter = LinklyAdapterEndpoint.Parse(configuredLinklyBase, out var adapterConfigurationError);
        var linklyMode = string.IsNullOrWhiteSpace(configuredLinklyBase)
            ? "lab"
            : linklyAdapter is null ? "configuration-error" : "tcp-proxy";

        app.MapGet("/v1/status", async () =>
        {
            var hasToken = settings.HasConnectorToken();
            var adapterListener = linklyMode == "tcp-proxy"
                ? await AdapterListenerProbe.ProbeAsync(configuredLinklyBase, TimeSpan.FromMilliseconds(800))
                : "not-configured";
            return Results.Json(new
            {
                linklyClient = hasToken
                    ? (linklyMode == "tcp-proxy" ? "tcp-proxy" : linklyMode == "lab" ? "simulated-ready" : "configuration-error")
                    : "waiting-for-token",
                terminal = linklyMode == "tcp-proxy" ? "local-adapter-configured" : linklyMode == "lab" ? "simulation" : "not-configured",
                tokenConfigured = hasToken,
                tokenRecoveryRequired = settings.TokenRecoveryRequired,
                integrationMode = linklyMode,
                adapterListener,
                detail = !hasToken
                    ? settings.TokenRecoveryRequired
                        ? "The saved Connector token cannot be opened with this Windows user profile. Re-enter EFTPOS settings to restore the connection."
                        : "Save EFTPOS in Hardware settings — token syncs automatically (Hardware Connect 1.1.1+)."
                    : linklyMode == "tcp-proxy"
                        ? $"A local Linkly HTTP adapter is configured; its TCP listener is {adapterListener}. This does not verify the adapter protocol, bank Linkly client, or terminal."
                        : linklyMode == "configuration-error"
                            ? adapterConfigurationError
                            : "Lab mode is diagnostic only; it cannot approve or process Sell payments. Configure the real Linkly adapter first.",
            }, json);
        });

        app.MapPost("/v1/config", async (HttpRequest request) =>
        {
            ConnectorConfigRequest? body;
            try
            {
                body = await JsonSerializer.DeserializeAsync<ConnectorConfigRequest>(request.Body, json, cancellationToken);
            }
            catch (JsonException)
            {
                return Results.BadRequest(new { error = "Request body must be valid JSON." });
            }

            if (body is null)
            {
                return Results.BadRequest(new { error = "Invalid JSON" });
            }

            if (!ConnectorRequestValidation.IsValidConfig(body.OrithosApiUrl, body.ConnectorToken)
                || !Uri.TryCreate(body.OrithosApiUrl, UriKind.Absolute, out var apiUri)
                || !LocalRequestSecurity.IsAllowedOrigin(apiUri.GetLeftPart(UriPartial.Authority))
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
            ConnectorTxnRequest? body;
            try
            {
                body = await JsonSerializer.DeserializeAsync<ConnectorTxnRequest>(request.Body, json, cancellationToken);
            }
            catch (JsonException)
            {
                return Results.BadRequest(new { error = "Request body must be valid JSON." });
            }

            if (body is null || !ConnectorRequestValidation.IsValidTransaction(
                    new ConnectorRequestValidation.ConnectorRequestFields(body.AttemptId, body.ConnectorChallenge, body.OrderUuid)))
            {
                return Results.BadRequest(new { error = "A positive attemptId and valid connectorChallenge are required; orderUuid must not exceed 256 characters." });
            }

            if (!settings.HasConnectorToken())
            {
                return Results.Problem("Connector token is not configured. Save EFTPOS settings in Hardware Connect before querying a transaction.", statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            if (linklyAdapter is null)
            {
                var message = linklyMode == "lab"
                    ? "Lab mode cannot query terminal payments. Configure the real Linkly adapter before reconciling this attempt."
                    : adapterConfigurationError;
                return Results.Problem(message, statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            var forwarded = await TryForwardToLinklyTcpAsync(linklyAdapter.BaseUrl, "/v1/query", body!, json, cancellationToken);
            return forwarded!;
        });

        app.MapPost("/v1/purchase", async (HttpRequest request) =>
        {
            ConnectorTxnRequest? body;
            try
            {
                body = await JsonSerializer.DeserializeAsync<ConnectorTxnRequest>(request.Body, json, cancellationToken);
            }
            catch (JsonException)
            {
                return Results.BadRequest(new { error = "Request body must be valid JSON." });
            }

            if (body is null || !ConnectorRequestValidation.IsValidTransaction(
                    new ConnectorRequestValidation.ConnectorRequestFields(body.AttemptId, body.ConnectorChallenge, body.OrderUuid)))
            {
                return Results.BadRequest(new { error = "A positive attemptId and valid connectorChallenge are required; orderUuid must not exceed 256 characters." });
            }

            if (body.AmountCents is not > 0 || !string.Equals(body.Currency, "AUD", StringComparison.OrdinalIgnoreCase))
            {
                return Results.BadRequest(new { error = "A positive amountCents and AUD currency are required" });
            }

            if (!settings.HasConnectorToken())
            {
                return Results.Problem("Connector token is not configured. Save EFTPOS settings in Hardware Connect before starting a payment.", statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            if (linklyAdapter is null)
            {
                var message = linklyMode == "lab"
                    ? "Lab mode cannot approve or process Sell payments. Configure the real Linkly adapter before enabling card payments."
                    : adapterConfigurationError;
                return Results.Problem(message, statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            body = body with { Currency = "AUD" };
            var forwarded = await TryForwardToLinklyTcpAsync(linklyAdapter.BaseUrl, "/v1/purchase", body, json, cancellationToken);
            return forwarded!;
        });

        await app.StartAsync(cancellationToken);
        onStarted?.Invoke();
        await app.WaitForShutdownAsync(cancellationToken);
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
            using var requestTimeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            requestTimeout.CancelAfter(TimeSpan.FromSeconds(30));
            using var request = new HttpRequestMessage(HttpMethod.Post, $"{linklyTcpBase}{path}");
            request.Content = JsonContent.Create(body, options: json);
            using var response = await CallbackClient.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                requestTimeout.Token);
            await using var responseStream = await response.Content.ReadAsStreamAsync(requestTimeout.Token);
            var text = await BoundedResponseReader.ReadAsync(
                responseStream,
                response.Content.Headers.ContentLength,
                requestTimeout.Token);
            return Results.Content(text, "application/json", statusCode: (int)response.StatusCode);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Linkly HTTP adapter forward failed: {ex.GetType().Name}");
            SupportLog.Record("error", "eftpos.adapter.request-failed", ex);
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
