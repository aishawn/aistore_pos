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
        const string responseBody = "{\"status\":\"DECLINED\"}";
        using var client = Client(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(responseBody, Encoding.UTF8, "application/json"),
        });

        var result = await LinklyConnectorWebApp.ForwardToLinklyAdapterAsync(
            "http://127.0.0.1:8088", "/v1/query", TransactionRequest(), Json,
            CancellationToken.None, client, TimeSpan.FromSeconds(1));
        var (status, body) = await Execute(result!);

        Assert.Equal(StatusCodes.Status200OK, status);
        Assert.Equal(responseBody, body);
    }

    [Fact]
    public async Task OversizedAdapterResponseBecomesUnknownOutcomeWithoutForwardingItsBody()
    {
        var sensitiveBody = new string('x', BoundedResponseReader.MaximumBodyBytes + 1);
        using var client = Client(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(sensitiveBody, Encoding.UTF8, "application/json"),
        });

        var result = await LinklyConnectorWebApp.ForwardToLinklyAdapterAsync(
            "http://127.0.0.1:8088", "/v1/purchase", TransactionRequest(), Json,
            CancellationToken.None, client, TimeSpan.FromSeconds(1));
        var (status, body) = await Execute(result!);

        Assert.Equal(StatusCodes.Status502BadGateway, status);
        Assert.Contains("outcome may be unknown", body, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("do not retry", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(new string('x', 128), body);
    }

    [Fact]
    public async Task AdapterTimeoutBecomesUnknownOutcome()
    {
        using var client = new HttpClient(new BlockingHandler());

        var result = await LinklyConnectorWebApp.ForwardToLinklyAdapterAsync(
            "http://127.0.0.1:8088", "/v1/purchase", TransactionRequest(), Json,
            CancellationToken.None, client, TimeSpan.FromMilliseconds(25));
        var (status, body) = await Execute(result!);

        Assert.Equal(StatusCodes.Status502BadGateway, status);
        Assert.Contains("outcome may be unknown", body, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("do not retry", body, StringComparison.OrdinalIgnoreCase);
    }

    private static HttpClient Client(Func<HttpRequestMessage, HttpResponseMessage> responder) =>
        new(new StubHandler(responder));

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

    private sealed class BlockingHandler : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK);
        }
    }
}
