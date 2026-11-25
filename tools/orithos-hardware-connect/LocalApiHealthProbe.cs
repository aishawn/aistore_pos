using System.Net;

namespace Orithos.HardwareConnect;

internal static class LocalApiHealthProbe
{
    public static async Task<string> ProbeAsync(string baseUrl, HttpClient client, CancellationToken cancellationToken)
    {
        try
        {
            using var response = await client.GetAsync(new Uri(new Uri(baseUrl), "v1/health"), cancellationToken);
            return response.IsSuccessStatusCode
                ? "Ready"
                : $"Unavailable (HTTP {(int)response.StatusCode})";
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
    }
}
