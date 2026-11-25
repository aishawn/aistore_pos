using System.Net;
using System.Text.Json;

namespace Orithos.HardwareConnect;

internal static class LocalApiHealthProbe
{
    public static async Task<string> ProbeAsync(string baseUrl, HttpClient client, CancellationToken cancellationToken)
    {
        try
        {
            using var response = await client.GetAsync(new Uri(new Uri(baseUrl), "v1/health"), cancellationToken);
            if (!response.IsSuccessStatusCode) return $"Unavailable (HTTP {(int)response.StatusCode})";

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return "Unavailable (invalid health response)";
            var product = ReadString(root, "product");
            var version = ReadString(root, "version");
            return string.Equals(product, AgentVersion.Product, StringComparison.Ordinal)
                && string.Equals(version, AgentVersion.DisplayVersion, StringComparison.Ordinal)
                    ? "Ready"
                    : "Unavailable (identity mismatch)";
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return "Unavailable";
        }
        catch (HttpRequestException)
        {
            return "Unavailable";
        }
        catch (UriFormatException)
        {
            return "Unavailable";
        }
        catch (JsonException)
        {
            return "Unavailable (invalid health response)";
        }
    }

    public static async Task<bool> WaitForBothReadyAsync(
        string hardwareBaseUrl,
        string eftposBaseUrl,
        HttpClient client,
        TimeSpan timeout,
        CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow + timeout;
        do
        {
            cancellationToken.ThrowIfCancellationRequested();
            var results = await Task.WhenAll(
                ProbeAsync(hardwareBaseUrl, client, cancellationToken),
                ProbeAsync(eftposBaseUrl, client, cancellationToken));
            if (results.All(result => result == "Ready")) return true;

            var remaining = deadline - DateTime.UtcNow;
            if (remaining <= TimeSpan.Zero) break;
            await Task.Delay(remaining < TimeSpan.FromMilliseconds(500) ? remaining : TimeSpan.FromMilliseconds(500), cancellationToken);
        }
        while (DateTime.UtcNow < deadline);

        return false;
    }

    private static string? ReadString(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}
