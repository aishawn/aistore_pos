using System.Net;

namespace Orithos.HardwareConnect;

internal static class LocalRequestSecurity
{
    public static bool IsLoopbackListenUrl(string value)
    {
        return Uri.TryCreate(value, UriKind.Absolute, out var uri)
            && uri.Scheme.Equals(Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase)
            && (uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
                || (IPAddress.TryParse(uri.Host, out var address) && IPAddress.IsLoopback(address)));
    }

    public static bool IsAllowedOrigin(string origin, string? configuredOrigins = null)
    {
        var allowed = new[]
        {
            "https://skr.orithos.com.au",
            "https://demo.orithos.com.au",
            "https://app.orithos.com.au",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3100",
            "http://127.0.0.1:3100",
            "http://localhost:3101",
            "http://127.0.0.1:3101",
        }.Concat((configuredOrigins ?? Environment.GetEnvironmentVariable("ORITHOS_ALLOWED_ORIGINS") ?? "")
            .Split([',', ';'], StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries));

        return allowed.Any(candidate => string.Equals(candidate, origin, StringComparison.OrdinalIgnoreCase));
    }
}
