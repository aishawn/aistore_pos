using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Orithos.HardwareConnect;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class LinklyAdapterTransportTests
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    [Fact]
    public async Task ForwardsJsonResponseAndStatusFromAdapter()
    {
        const string adapterBody = "{\"status\":\"DECLINED\",\"privateData\":\"must-not-leak\"}";
        using var adapter = Client(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(adapterBody, Encoding.UTF8, "application/json"),
        });
        string? callbackUri = null;
        string? callbackToken = null;
        string? callbackJson = null;
        using var callback = Client(async request =>
        {
            callbackUri = request.RequestUri!.ToString();
            callbackToken = request.Headers.GetValues("X-Orithos-Connector-Token").Single();
            callbackJson = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK);
        });

        var result = await Forward(
            "http://127.0.0.1:8088", "/v1/query", TransactionRequest(), Json,
            CancellationToken.None, adapter, callback, TimeSpan.FromSeconds(1));
        var (status, body) = await Execute(result!);

        Assert.Equal(StatusCodes.Status200OK, status);
        Assert.Equal("{\"status\":\"DECLINED\"}", body);
        Assert.DoesNotContain("privateData", body, StringComparison.Ordinal);
        Assert.Equal("https://skr.orithos.com.au/api/eftpos/connector/callback", callbackUri);
        Assert.Equal("secret-token", callbackToken);
        using var callbackDocument = JsonDocument.Parse(callbackJson!);
        var callbackBody = callbackDocument.RootElement;
        Assert.Equal(42, callbackBody.GetProperty("attemptId").GetInt64());
        Assert.Equal("challenge", callbackBody.GetProperty("connectorChallenge").GetString());
        Assert.Equal("DECLINED", callbackBody.GetProperty("status").GetString());
    }

    [Fact]
    public async Task ApprovedResultWritesReferenceToBackendButReturnsOnlyStatusToBrowser()
    {
        using var adapter = Client(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                "{\"status\":\"APPROVED\",\"providerReference\":\"RRN-12345\",\"privateData\":\"must-not-leak\"}",
                Encoding.UTF8, "application/json"),
        });
        string? callbackJson = null;
        using var callback = Client(async request =>
        {
            callbackJson = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK);
        });

        var result = await Forward(
            "http://127.0.0.1:8088", "/v1/purchase", TransactionRequest(), Json,
            CancellationToken.None, adapter, callback, TimeSpan.FromSeconds(1));
        var (status, body) = await Execute(result!);

        Assert.Equal(StatusCodes.Status200OK, status);
        Assert.Equal("{\"status\":\"APPROVED\"}", body);
        Assert.DoesNotContain("RRN-12345", body, StringComparison.Ordinal);
        using var callbackDocument = JsonDocument.Parse(callbackJson!);
        Assert.Equal("RRN-12345", callbackDocument.RootElement.GetProperty("providerReference").GetString());
    }

    [Fact]
    public async Task OversizedAdapterResponseBecomesUnknownOutcomeWithoutForwardingItsBody()
    {
        var sensitiveBody = new string('x', BoundedResponseReader.MaximumBodyBytes + 1);
        using var adapter = Client(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(sensitiveBody, Encoding.UTF8, "application/json"),
        });
        using var callback = Client(_ => new HttpResponseMessage(HttpStatusCode.OK));

        var result = await Forward(
            "http://127.0.0.1:8088", "/v1/purchase", TransactionRequest(), Json,
            CancellationToken.None, adapter, callback, TimeSpan.FromSeconds(1));
        var (status, body) = await Execute(result!);

        Assert.Equal(StatusCodes.Status502BadGateway, status);
        Assert.Contains("outcome may be unknown", body, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("do not retry", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(new string('x', 128), body);
    }

    [Fact]
    public async Task AdapterTimeoutBecomesUnknownOutcome()
    {
        using var adapter = new HttpClient(new BlockingHandler());
        using var callback = Client(_ => new HttpResponseMessage(HttpStatusCode.OK));

        var result = await Forward(
            "http://127.0.0.1:8088", "/v1/purchase", TransactionRequest(), Json,
            CancellationToken.None, adapter, callback, TimeSpan.FromMilliseconds(25));
        var (status, body) = await Execute(result!);

        Assert.Equal(StatusCodes.Status502BadGateway, status);
        Assert.Contains("outcome may be unknown", body, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("do not retry", body, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("{\"status\":\"PENDING\"}")]
    [InlineData("{\"status\":\"APPROVED\",\"providerReference\":7}")]
    [InlineData("{invalid")]
    public async Task InvalidAdapterResultReturnsUnknownAndAttemptsUnknownCallback(string adapterBody)
    {
        using var adapter = Client(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(adapterBody, Encoding.UTF8, "application/json"),
        });
        string? callbackBody = null;
        using var callback = Client(async request =>
        {
            callbackBody = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK);
        });

        var result = await Forward(
            "http://127.0.0.1:8088", "/v1/purchase", TransactionRequest(), Json,
            CancellationToken.None, adapter, callback, TimeSpan.FromSeconds(1));
        var (status, body) = await Execute(result!);

        Assert.Equal(StatusCodes.Status502BadGateway, status);
        Assert.Contains("outcome may be unknown", body, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("do not retry", body, StringComparison.OrdinalIgnoreCase);
        Assert.NotNull(callbackBody);
        Assert.Contains("\"status\":\"UNKNOWN\"", callbackBody, StringComparison.Ordinal);
    }

    [Fact]
    public async Task CallbackFailureDoesNotReportAdapterApprovalAsSuccess()
    {
        using var adapter = Client(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"status\":\"APPROVED\"}", Encoding.UTF8, "application/json"),
        });
        using var callback = Client(_ => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));

        var result = await Forward(
            "http://127.0.0.1:8088", "/v1/purchase", TransactionRequest(), Json,
            CancellationToken.None, adapter, callback, TimeSpan.FromSeconds(1));
        var (status, body) = await Execute(result!);

        Assert.Equal(StatusCodes.Status502BadGateway, status);
        Assert.Contains("outcome may be unknown", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("APPROVED", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task CallbackRejectsUnapprovedApiHostWithoutSendingToken()
    {
        using var adapter = Client(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"status\":\"APPROVED\"}", Encoding.UTF8, "application/json"),
        });
        var callbackCalls = 0;
        using var callback = Client(_ =>
        {
            callbackCalls++;
            return new HttpResponseMessage(HttpStatusCode.OK);
        });

        var result = await LinklyConnectorWebApp.ForwardToLinklyAdapterAsync(
            "http://127.0.0.1:8088", "/v1/purchase", TransactionRequest(), Json,
            "https://untrusted.example", "secret-token", CancellationToken.None,
            adapter, callback, TimeSpan.FromSeconds(1));
        var (status, body) = await Execute(result!);

        Assert.Equal(StatusCodes.Status502BadGateway, status);
        Assert.Equal(0, callbackCalls);
        Assert.Contains("outcome may be unknown", body, StringComparison.OrdinalIgnoreCase);
    }

    private static HttpClient Client(Func<HttpRequestMessage, HttpResponseMessage> responder) =>
        new(new StubHandler(responder));

    private static HttpClient Client(Func<HttpRequestMessage, Task<HttpResponseMessage>> responder) =>
        new(new AsyncStubHandler(responder));

    private static Task<IResult> Forward(
        string adapterUrl,
        string path,
        LinklyConnectorWebApp.ConnectorTxnRequest transaction,
        JsonSerializerOptions json,
        CancellationToken cancellationToken,
        HttpClient adapter,
        HttpClient callback,
        TimeSpan timeout) =>
        LinklyConnectorWebApp.ForwardToLinklyAdapterAsync(
            adapterUrl, path, transaction, json, "https://skr.orithos.com.au", "secret-token",
            cancellationToken, adapter, callback, timeout);

    private static LinklyConnectorWebApp.ConnectorTxnRequest TransactionRequest() =>
        new(42, "order-uuid", "challenge", 1250, "AUD");

    private static async Task<(int Status, string Body)> Execute(IResult result)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddProblemDetails();
        using var provider = services.BuildServiceProvider();
        var context = new DefaultHttpContext { RequestServices = provider };
        await using var responseBody = new MemoryStream();
        context.Response.Body = responseBody;
        await result.ExecuteAsync(context);
        responseBody.Position = 0;
        using var reader = new StreamReader(responseBody);
        return (context.Response.StatusCode, await reader.ReadToEndAsync());
    }

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(responder(request));
    }

    private sealed class AsyncStubHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> responder) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            responder(request);
    }

    private sealed class BlockingHandler : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK);
        }
    }
}
