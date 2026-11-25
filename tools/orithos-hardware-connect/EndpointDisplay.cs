namespace Orithos.HardwareConnect;

internal static class EndpointDisplay
{
    public static string SafeLabel(string value)
    {
        if (!LocalRequestSecurity.IsLoopbackListenUrl(value)
            || !Uri.TryCreate(value, UriKind.Absolute, out var uri))
        {
            return "hidden (non-loopback or invalid URL)";
        }

        var host = uri.HostNameType == UriHostNameType.IPv6
            ? $"[{uri.Host.Trim('[', ']')}]"
            : uri.Host;
        return $"{host}:{uri.Port}";
    }
}
