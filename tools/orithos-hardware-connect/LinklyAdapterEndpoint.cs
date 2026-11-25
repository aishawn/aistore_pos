using System.Net;

namespace Orithos.HardwareConnect;

internal sealed record LinklyAdapterEndpoint(string BaseUrl)
{
    public static string? ResolveConfiguredBase(string? adapterBase, string? legacyTcpBase)
    {
        return !string.IsNullOrWhiteSpace(adapterBase)
            ? adapterBase.Trim()
            : string.IsNullOrWhiteSpace(legacyTcpBase) ? null : legacyTcpBase.Trim();
    }

    public static LinklyAdapterEndpoint? Parse(string? configuredBase, out string? error)
    {
        error = null;
        if (string.IsNullOrWhiteSpace(configuredBase)) return null;

        if (!Uri.TryCreate(configuredBase.Trim(), UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            || (!uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
                && (!IPAddress.TryParse(uri.Host, out var address) || !IPAddress.IsLoopback(address)))
            || !string.IsNullOrEmpty(uri.UserInfo)
            || !string.IsNullOrEmpty(uri.Query)
            || !string.IsNullOrEmpty(uri.Fragment)
            || uri.AbsolutePath != "/")
        {
            error = "ORITHOS_LINKLY_ADAPTER_BASE (or legacy ORITHOS_LINKLY_TCP_BASE) must be a local HTTP(S) adapter URL on localhost or a loopback IP, without credentials, query, fragment, or path.";
            return null;
        }

        return new LinklyAdapterEndpoint(uri.GetLeftPart(UriPartial.Authority).TrimEnd('/'));
    }
}
