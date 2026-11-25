using System.Net;
using System.Net.Sockets;
using System.Reflection;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class AdapterListenerProbeTests
{
    [Fact]
    public async Task ReportsAListeningLoopbackPortAsReachable()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var endpoint = $"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}";

        var result = await ProbeAsync(endpoint, TimeSpan.FromSeconds(1));

        Assert.Equal("reachable", result);
    }

    [Fact]
    public async Task ReportsAClosedLoopbackPortAsUnreachable()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var endpoint = $"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}";
        listener.Stop();

        var result = await ProbeAsync(endpoint, TimeSpan.FromSeconds(1));

        Assert.Equal("unreachable", result);
    }

    [Theory]
    [InlineData("http://192.0.2.1:8080")]
    [InlineData("not a url")]
    public async Task DoesNotProbeNonLoopbackOrInvalidAddresses(string endpoint)
    {
        var result = await ProbeAsync(endpoint, TimeSpan.FromSeconds(1));

        Assert.Equal("not-configured", result);
    }

    private static Task<string> ProbeAsync(string endpoint, TimeSpan timeout)
    {
        var type = Assembly.Load("OrithosHardwareConnect").GetType("Orithos.HardwareConnect.AdapterListenerProbe", throwOnError: true)!;
        var method = type.GetMethod("ProbeAsync", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        return (Task<string>)method.Invoke(null, [endpoint, timeout])!;
    }
}
