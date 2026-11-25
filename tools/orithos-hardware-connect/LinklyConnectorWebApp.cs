using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Orithos.HardwareConnect;

/// <summary>Local EFTPOS bridge on 9167 — same register agent as receipt printing (9170).</summary>
internal static class LinklyConnectorWebApp
{
    private static readonly HttpClient AdapterClient = new(new HttpClientHandler { AllowAutoRedirect = false })
    {
        Timeout = TimeSpan.FromSeconds(30),
    };

    private static readonly HttpClient CallbackClient = new(new HttpClientHandler { AllowAutoRedirect = false })
    {
        Timeout = TimeSpan.FromSeconds(10),
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
        var tcpConfigured = string.IsNullOrWhiteSpace(configuredLinklyBase)
            && (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ORITHOS_LINKLY_TCP_HOST"))
                || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ORITHOS_LINKLY_TCP_PORT")));
        var integrationMode = !string.IsNullOrWhiteSpace(configuredLinklyBase)
            ? linklyAdapter is null ? "configuration-error" : "adapter"
            : tcpConfigured ? "tcp-ip-interface" : "lab";

        app.MapGet("/v1/status", async () =>
        {
            var hasToken = settings.HasConnectorToken();
            var adapterListener = integrationMode == "adapter"
                ? await AdapterListenerProbe.ProbeAsync(configuredLinklyBase, TimeSpan.FromMilliseconds(800))
                : "not-configured";
            var tcpEndpoint = integrationMode == "tcp-ip-interface" || integrationMode == "lab"
                ? await LinklyTcpEndpoint.DiscoverAsync(CancellationToken.None)
                : null;
            var effectiveMode = tcpEndpoint is not null && linklyAdapter is null ? "tcp-ip-interface" : integrationMode;
            return Results.Json(new
            {
                linklyClient = hasToken
                    ? (effectiveMode == "adapter" ? "adapter-configured" : effectiveMode == "tcp-ip-interface" ? "linkly-tcp-connected" : effectiveMode == "lab" ? "simulated-ready" : "configuration-error")
                    : "waiting-for-token",
                terminal = effectiveMode == "adapter" ? "local-adapter-configured" : effectiveMode == "tcp-ip-interface" ? "linkly-tcp" : effectiveMode == "lab" ? "simulation" : "not-configured",
                tokenConfigured = hasToken,
                tokenRecoveryRequired = settings.TokenRecoveryRequired,
                integrationMode = effectiveMode,
                adapterListener,
                tcpEndpoint = tcpEndpoint?.Display,
                detail = !hasToken
                    ? settings.TokenRecoveryRequired
                        ? "The saved Connector token cannot be opened with this Windows user profile. Re-enter EFTPOS settings to restore the connection."
                        : "Save EFTPOS in Hardware settings — token syncs automatically (Hardware Connect 1.1.1+)."
                    : effectiveMode == "adapter"
                        ? $"A local Linkly HTTP adapter is configured; its TCP listener is {adapterListener}. This does not verify the adapter protocol, bank Linkly client, or terminal."
                        : effectiveMode == "tcp-ip-interface"
                            ? $"Connected to the Linkly TCP/IP interface at {tcpEndpoint!.Display}. Protocol is the official fixed-width API; terminal approval still requires a real authorized test."
                        : effectiveMode == "configuration-error"
                            ? adapterConfigurationError
                            : "Lab mode: no Linkly TCP listener on 2011/2005 and no HTTP adapter configured. Start Linkly EFT-Client (Shopfront-style TCP) or set ORITHOS_LINKLY_ADAPTER_BASE.",
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

            var (apiUrl, token) = settings.Snapshot();
            if (linklyAdapter is null)
            {
                if (!string.IsNullOrWhiteSpace(configuredLinklyBase))
                    return Results.Problem(adapterConfigurationError, statusCode: StatusCodes.Status503ServiceUnavailable);
                var endpoint = await LinklyTcpEndpoint.DiscoverAsync(cancellationToken);
                if (endpoint is null) return await TcpUnavailableAsync(apiUrl, token, body!, cancellationToken);
                return await ForwardToLinklyTcpReconciliationAsync(endpoint, body!, apiUrl, token, cancellationToken, CallbackClient);
            }
            var forwarded = await ForwardToLinklyAdapterAsync(linklyAdapter.BaseUrl, "/v1/query", body!, json,
                apiUrl, token, cancellationToken, AdapterClient, CallbackClient, TimeSpan.FromSeconds(30));
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

            body = body with { Currency = "AUD" };
            var (apiUrl, token) = settings.Snapshot();
            if (linklyAdapter is null)
            {
                if (!string.IsNullOrWhiteSpace(configuredLinklyBase))
                    return Results.Problem(adapterConfigurationError, statusCode: StatusCodes.Status503ServiceUnavailable);
                var endpoint = await LinklyTcpEndpoint.DiscoverAsync(cancellationToken);
                if (endpoint is null) return await TcpUnavailableAsync(apiUrl, token, body, cancellationToken);
                return await ForwardToLinklyTcpPurchaseAsync(endpoint, body, apiUrl, token, cancellationToken, CallbackClient);
            }
            var forwarded = await ForwardToLinklyAdapterAsync(linklyAdapter.BaseUrl, "/v1/purchase", body, json,
                apiUrl, token, cancellationToken, AdapterClient, CallbackClient, TimeSpan.FromSeconds(30));
            return forwarded!;
        });

        await app.StartAsync(cancellationToken);
        onStarted?.Invoke();
        await app.WaitForShutdownAsync(cancellationToken);
    }

    private static async Task<IResult> ForwardToLinklyTcpPurchaseAsync(
        LinklyTcpEndpoint endpoint,
        ConnectorTxnRequest transaction,
        string apiUrl,
        string token,
        CancellationToken cancellationToken,
        HttpClient callbackClient)
    {
        var txnRef = BuildTxnReference(transaction);
        try
        {
            var result = await LinklyTcpClient.PurchaseAsync(endpoint, transaction.AmountCents!.Value, txnRef, cancellationToken);
            var txnRefMatched = string.IsNullOrWhiteSpace(result.TransactionReference)
                || string.Equals(result.TransactionReference, txnRef, StringComparison.Ordinal);
            var status = txnRefMatched ? result.Status : "UNKNOWN";
            var callback = new LinklyAdapterResult(
                status,
                txnRefMatched ? result.ProviderReference ?? txnRef : null);
            if (!await TryWriteCallbackAsync(apiUrl, token, transaction, callback, callbackClient)) return UnknownOutcome();
            return Results.Json(new { status }, statusCode: status == "UNKNOWN" ? 502 : 200);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Linkly TCP purchase failed: {ex.GetType().Name}");
            SupportLog.Record("error", "eftpos.tcp.request-failed", ex);
            await TryWriteUnknownAsync(apiUrl, token, transaction, callbackClient);
            return UnknownOutcome();
        }
    }

    private static async Task<IResult> ForwardToLinklyTcpReconciliationAsync(
        LinklyTcpEndpoint endpoint,
        ConnectorTxnRequest transaction,
        string apiUrl,
        string token,
        CancellationToken cancellationToken,
        HttpClient callbackClient)
    {
        var txnRef = BuildTxnReference(transaction);
        try
        {
            var result = await LinklyTcpClient.GetLastTransactionAsync(endpoint, txnRef, cancellationToken);
            var matchedAttempt = string.Equals(result.TransactionReference, txnRef, StringComparison.Ordinal);
            var callback = new LinklyAdapterResult(matchedAttempt ? result.Status : "UNKNOWN", matchedAttempt ? result.ProviderReference : null);
            if (!await TryWriteCallbackAsync(apiUrl, token, transaction, callback, callbackClient)) return UnknownOutcome();
            return Results.Json(new { status = callback.Status }, statusCode: callback.Status == "UNKNOWN" ? 502 : 200);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Linkly TCP query failed: {ex.GetType().Name}");
            SupportLog.Record("error", "eftpos.tcp.query-failed", ex);
            await TryWriteUnknownAsync(apiUrl, token, transaction, callbackClient);
            return UnknownOutcome();
        }
    }

    private static async Task<IResult> TcpUnavailableAsync(string apiUrl, string token, ConnectorTxnRequest transaction, CancellationToken cancellationToken)
    {
        await TryWriteUnknownAsync(apiUrl, token, transaction, CallbackClient);
        return Results.Problem("Linkly TCP/IP interface was not found on ports 2011 or 2005. Confirm Linkly EFT-Client is running and configured for the IP interface.", statusCode: 503);
    }

    private static string BuildTxnReference(ConnectorTxnRequest transaction)
    {
        var source = $"O{transaction.AttemptId}";
        return source.Length <= 16 ? source : source[^16..];
    }

    internal static async Task<IResult> ForwardToLinklyAdapterAsync(
        string adapterBaseUrl,
        string path,
        ConnectorTxnRequest body,
        JsonSerializerOptions json,
        string orithosApiUrl,
        string connectorToken,
        CancellationToken cancellationToken,
        HttpClient adapterClient,
        HttpClient callbackClient,
        TimeSpan timeout)
    {
        try
        {
            using var requestCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            requestCts.CancelAfter(timeout);
            using var request = new HttpRequestMessage(HttpMethod.Post, $"{adapterBaseUrl}{path}");
            request.Content = JsonContent.Create(body, options: json);
            using var response = await adapterClient.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                requestCts.Token);
            await using var responseStream = await response.Content.ReadAsStreamAsync(requestCts.Token);
            var text = await BoundedResponseReader.ReadAsync(
                responseStream,
                response.Content.Headers.ContentLength,
                requestCts.Token);
            if (!response.IsSuccessStatusCode)
            {
                await TryWriteUnknownAsync(orithosApiUrl, connectorToken, body, callbackClient);
                return UnknownOutcome();
            }

            if (!LinklyAdapterResult.TryParse(text, out var result))
            {
                await TryWriteUnknownAsync(orithosApiUrl, connectorToken, body, callbackClient);
                return UnknownOutcome();
            }

            if (!await TryWriteCallbackAsync(orithosApiUrl, connectorToken, body, result!, callbackClient))
                return UnknownOutcome();

            return Results.Json(new { status = result!.Status }, json, statusCode: (int)response.StatusCode);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Linkly HTTP adapter forward failed: {ex.GetType().Name}");
            SupportLog.Record("error", "eftpos.adapter.request-failed", ex);
            await TryWriteUnknownAsync(orithosApiUrl, connectorToken, body, callbackClient);
            return UnknownOutcome();
        }
    }

    private static async Task<bool> TryWriteCallbackAsync(
        string apiUrl,
        string connectorToken,
        ConnectorTxnRequest transaction,
        LinklyAdapterResult result,
        HttpClient client)
    {
        if (!IsAllowedCallbackBase(apiUrl))
        {
            return false;
        }

        try
        {
            using var callbackCts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            using var request = new HttpRequestMessage(HttpMethod.Post, $"{new Uri(apiUrl).GetLeftPart(UriPartial.Authority)}/api/eftpos/connector/callback");
            request.Headers.TryAddWithoutValidation("X-Orithos-Connector-Token", connectorToken);
            request.Content = JsonContent.Create(new ConnectorCallbackRequest(
                transaction.AttemptId, transaction.ConnectorChallenge!, result.Status, result.ProviderReference));
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, callbackCts.Token);
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"EFTPOS result callback failed: {ex.GetType().Name}");
            SupportLog.Record("error", "eftpos.callback.failed", ex);
            return false;
        }
    }

    private static async Task TryWriteUnknownAsync(
        string apiUrl,
        string connectorToken,
        ConnectorTxnRequest transaction,
        HttpClient client)
    {
        await TryWriteCallbackAsync(apiUrl, connectorToken, transaction,
            new LinklyAdapterResult("UNKNOWN", null), client);
    }

    private static IResult UnknownOutcome() => Results.Problem(
        "No confirmed payment result was recorded. The outcome may be unknown; do not retry until the terminal and Linkly journal are checked.",
        statusCode: StatusCodes.Status502BadGateway);

    private static bool IsAllowedCallbackBase(string apiUrl) =>
        Uri.TryCreate(apiUrl, UriKind.Absolute, out var uri)
        && string.IsNullOrEmpty(uri.UserInfo)
        && string.IsNullOrEmpty(uri.Query)
        && string.IsNullOrEmpty(uri.Fragment)
        && uri.AbsolutePath == "/"
        && LocalRequestSecurity.IsAllowedOrigin(uri.GetLeftPart(UriPartial.Authority));

    private sealed record ConnectorConfigRequest(string? OrithosApiUrl, string? ConnectorToken);

    private sealed record ConnectorCallbackRequest(long AttemptId, string ConnectorChallenge, string Status, string? ProviderReference);

    internal sealed record ConnectorTxnRequest(
        long AttemptId,
        string? OrderUuid,
        string? ConnectorChallenge,
        int? AmountCents = null,
        string? Currency = null);
}
