using System.Net.Sockets;

namespace Orithos.HardwareConnect;

internal static class AdapterListenerProbe
{
    public static async Task<string> ProbeAsync(string? configuredBase, TimeSpan timeout)
    {
        var adapter = LinklyAdapterEndpoint.Parse(configuredBase, out _);
        if (adapter is null || timeout <= TimeSpan.Zero) return "not-configured";

        if (!Uri.TryCreate(adapter.BaseUrl, UriKind.Absolute, out var uri)) return "unreachable";

        using var cancellation = new CancellationTokenSource(timeout);
        using var client = new TcpClient();
        try
        {
            await client.ConnectAsync(uri.Host, uri.Port, cancellation.Token);
            return "reachable";
        }
        catch (Exception ex) when (ex is SocketException or OperationCanceledException or ArgumentException)
        {
            return "unreachable";
        }
    }
}
