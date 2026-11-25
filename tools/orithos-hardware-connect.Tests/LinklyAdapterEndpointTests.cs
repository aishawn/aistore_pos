using System.Reflection;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class LinklyAdapterEndpointTests
{
    [Fact]
    public void PrefersTheExplicitHttpAdapterSettingAndKeepsTheLegacyAlias()
    {
        Assert.Equal("http://127.0.0.1:8088", ResolveConfiguredBase(" http://127.0.0.1:8088 ", "http://127.0.0.1:9000"));
        Assert.Equal("http://127.0.0.1:9000", ResolveConfiguredBase(null, " http://127.0.0.1:9000 "));
        Assert.Null(ResolveConfiguredBase(" ", null));
    }

    [Theory]
    [InlineData("http://127.0.0.1:8088", "http://127.0.0.1:8088")]
    [InlineData("https://localhost:8443/", "https://localhost:8443")]
    [InlineData("http://[::1]:8088/", "http://[::1]:8088")]
    public void AcceptsOnlyLoopbackAdapterOrigins(string configured, string expected)
    {
        var (endpoint, error) = Parse(configured);

        Assert.NotNull(endpoint);
        Assert.Null(error);
        Assert.Equal(expected, endpoint);
    }

    [Theory]
    [InlineData("https://adapter.example/v1")]
    [InlineData("http://192.168.1.20:8088")]
    [InlineData("http://user:secret@127.0.0.1:8088")]
    [InlineData("http://127.0.0.1:8088/?target=external")]
    [InlineData("http://127.0.0.1:8088/#fragment")]
    [InlineData("file:///tmp/adapter")]
    public void RejectsRemoteOrAmbiguousAdapterUrls(string configured)
    {
        var (endpoint, error) = Parse(configured);

        Assert.Null(endpoint);
        Assert.Contains("must be a local HTTP(S) adapter URL", error);
    }

    [Fact]
    public void EmptyConfigurationRemainsLabModeWithoutAnError()
    {
        var (endpoint, error) = Parse(null);

        Assert.Null(endpoint);
        Assert.Null(error);
    }

    private static (string? Endpoint, string? Error) Parse(string? configured)
    {
        var assembly = Assembly.Load("OrithosHardwareConnect");
        var type = assembly.GetType("Orithos.HardwareConnect.LinklyAdapterEndpoint", throwOnError: true)!;
        var method = type.GetMethod("Parse", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        var arguments = new object?[] { configured, null };
        var endpoint = method.Invoke(null, arguments);
        var baseUrl = endpoint?.GetType().GetProperty("BaseUrl")?.GetValue(endpoint) as string;
        return (baseUrl, arguments[1] as string);
    }

    private static string? ResolveConfiguredBase(string? adapterBase, string? legacyTcpBase)
    {
        var assembly = Assembly.Load("OrithosHardwareConnect");
        var type = assembly.GetType("Orithos.HardwareConnect.LinklyAdapterEndpoint", throwOnError: true)!;
        var method = type.GetMethod("ResolveConfiguredBase", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        return method.Invoke(null, [adapterBase, legacyTcpBase]) as string;
    }
}
