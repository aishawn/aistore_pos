using System.Net;
using System.Reflection;
using Orithos.HardwareConnect;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class LocalApiHealthProbeTests
{
    [Fact]
    public async Task ReportsReadyWhenHealthEndpointReturnsSuccess()
    {
        using var client = Client(_ => new HttpResponseMessage(HttpStatusCode.OK));

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
    public async Task ReportsUnavailableWhenHealthEndpointCannotBeReached()
    {
        using var client = Client(_ => throw new HttpRequestException("private path detail"));

        var result = await Probe("http://127.0.0.1:9170/", client);

        Assert.Equal("Unavailable", result);
        Assert.DoesNotContain("private path detail", result);
    }

    private static HttpClient Client(Func<HttpRequestMessage, HttpResponseMessage> responder) =>
        new(new StubHandler(responder));

    private static Task<string> Probe(string baseUrl, HttpClient client)
    {
        var assembly = Assembly.Load("OrithosHardwareConnect");
        var type = assembly.GetType("Orithos.HardwareConnect.LocalApiHealthProbe", throwOnError: true)!;
        var method = type.GetMethod("ProbeAsync", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        return (Task<string>)method.Invoke(null, [baseUrl, client, CancellationToken.None])!;
    }

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(responder(request));
    }
}
