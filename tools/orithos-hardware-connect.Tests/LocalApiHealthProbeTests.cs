using System.Net;
using System.Net.Http.Json;
using System.Reflection;
using Orithos.HardwareConnect;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class LocalApiHealthProbeTests
{
    [Fact]
    public async Task ReportsReadyWhenHealthEndpointReturnsSuccess()
    {
        using var client = Client(_ => HealthResponse(HttpStatusCode.OK));

        var result = await Probe("http://127.0.0.1:9170/", client);

        Assert.Equal("Ready", result);
    }

    [Fact]
    public async Task ReportsUnavailableWhenHealthEndpointRejectsTheProbe()
    {
        using var client = Client(_ => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));

        var result = await Probe("http://127.0.0.1:9170/", client);

        Assert.Equal("Unavailable (HTTP 503)", result);
    }

    [Fact]
    public async Task RejectsHealthEndpointWithDifferentProductOrVersion()
    {
        var identity = AgentIdentity();
        using var client = Client(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = JsonContent.Create(new { product = "Other app", version = identity.Version }),
        });

        var result = await Probe("http://127.0.0.1:9170/", client);

        Assert.Equal("Unavailable (identity mismatch)", result);
    }

    [Fact]
    public async Task RejectsMalformedHealthResponse()
    {
        using var client = Client(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("not-json"),
        });

        var result = await Probe("http://127.0.0.1:9170/", client);

        Assert.Equal("Unavailable (invalid health response)", result);
    }

    [Fact]
    public async Task ReportsUnavailableWhenHealthEndpointCannotBeReached()
    {
        using var client = Client(_ => throw new HttpRequestException("private path detail"));

        var result = await Probe("http://127.0.0.1:9170/", client);

        Assert.Equal("Unavailable", result);
        Assert.DoesNotContain("private path detail", result);
    }

    [Fact]
    public async Task WaitsUntilBothLocalServicesAreReady()
    {
        using var client = Client(_ => HealthResponse(HttpStatusCode.OK));

        var result = await WaitForBoth("http://127.0.0.1:9170/", "http://127.0.0.1:9167/", client, TimeSpan.FromSeconds(1));

        Assert.True(result);
    }

    [Fact]
    public async Task ReturnsFalseWhenEitherLocalServiceNeverBecomesReady()
    {
        using var client = Client(request => request.RequestUri!.Port == 9170
            ? HealthResponse(HttpStatusCode.OK)
            : new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));

        var result = await WaitForBoth("http://127.0.0.1:9170/", "http://127.0.0.1:9167/", client, TimeSpan.FromMilliseconds(10));

        Assert.False(result);
    }

    private static HttpClient Client(Func<HttpRequestMessage, HttpResponseMessage> responder) =>
        new(new StubHandler(responder));

    private static HttpResponseMessage HealthResponse(HttpStatusCode status)
    {
        var identity = AgentIdentity();
        return new HttpResponseMessage(status)
        {
            Content = JsonContent.Create(new { product = identity.Product, version = identity.Version }),
        };
    }

    private static (string Product, string Version) AgentIdentity()
    {
        var type = Assembly.Load("OrithosHardwareConnect").GetType("Orithos.HardwareConnect.AgentVersion", throwOnError: true)!;
        var product = (string)type.GetField("Product", BindingFlags.Public | BindingFlags.Static)!.GetRawConstantValue()!;
        var version = (string)type.GetProperty("DisplayVersion", BindingFlags.Public | BindingFlags.Static)!.GetValue(null)!;
        return (product, version);
    }

    private static Task<string> Probe(string baseUrl, HttpClient client)
    {
        var assembly = Assembly.Load("OrithosHardwareConnect");
        var type = assembly.GetType("Orithos.HardwareConnect.LocalApiHealthProbe", throwOnError: true)!;
        var method = type.GetMethod("ProbeAsync", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        return (Task<string>)method.Invoke(null, [baseUrl, client, CancellationToken.None])!;
    }

    private static Task<bool> WaitForBoth(string hardwareUrl, string eftposUrl, HttpClient client, TimeSpan timeout)
    {
        var assembly = Assembly.Load("OrithosHardwareConnect");
        var type = assembly.GetType("Orithos.HardwareConnect.LocalApiHealthProbe", throwOnError: true)!;
        var method = type.GetMethod("WaitForBothReadyAsync", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        return (Task<bool>)method.Invoke(null, [hardwareUrl, eftposUrl, client, timeout, CancellationToken.None])!;
    }

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(responder(request));
    }
}
