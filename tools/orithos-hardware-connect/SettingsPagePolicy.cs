namespace Orithos.HardwareConnect;

internal static class SettingsPagePolicy
{
    public static bool TryGetSafeUri(string? value, out Uri? uri)
    {
        uri = null;
        if (string.IsNullOrWhiteSpace(value)
            || !Uri.TryCreate(value, UriKind.Absolute, out var candidate)
            || !string.IsNullOrEmpty(candidate.UserInfo))
        {
            return false;
        }

        var isHttps = candidate.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase);
        var isLoopbackHttp = LocalRequestSecurity.IsLoopbackListenUrl(value);
        if (!isHttps && !isLoopbackHttp) return false;

        uri = candidate;
        return true;
    }
}
