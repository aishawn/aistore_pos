using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Text.Json;

namespace Orithos.HardwareConnect;

internal static class LinklyDiscovery
{
    private static readonly HttpClient ProbeClient = new(new HttpClientHandler { AllowAutoRedirect = false })
    {
        Timeout = TimeSpan.FromMilliseconds(350),
    };

    private static readonly string[] LinklyProcessNames = ["Eftsrv", "LinklyClient", "EFTPOS", "EFTSRV", "EFTSRVClient"];

    public static async Task<LinklyDiscoveryResult> DiscoverAsync(CancellationToken cancellationToken)
    {
        var listeners = GetLoopbackListeners();
        var processNames = GetLinklyProcesses();
        var adapterCandidates = await ProbeHttpCandidatesAsync(listeners, cancellationToken);
        var linklyTcpPorts = new[] { 2005, 2011 }.Where(listeners.Contains).ToArray();
        var linklyPortListening = linklyTcpPorts.Length > 0;

        var state = GetState(processNames.Length, linklyPortListening, adapterCandidates.Length);

        return new LinklyDiscoveryResult(
            state,
            processNames,
            linklyPortListening,
            linklyTcpPorts,
            adapterCandidates,
            DateTimeOffset.UtcNow);
    }

    internal static string GetState(int processCount, bool linklyPortListening, int adapterCandidateCount) =>
        processCount > 0 || linklyPortListening
            ? adapterCandidateCount > 0 ? "adapter-candidate-found" : "linkly-client-found"
            : adapterCandidateCount > 0 ? "adapter-candidate-found" : "not-found";

    private static int[] GetLoopbackListeners()
    {
        try
        {
            return IPGlobalProperties.GetIPGlobalProperties()
                .GetActiveTcpListeners()
                .Where(endpoint => IPAddress.IsLoopback(endpoint.Address)
                    || endpoint.Address.Equals(IPAddress.Any)
                    || endpoint.Address.Equals(IPAddress.IPv6Any))
                .Select(endpoint => endpoint.Port)
                .Distinct()
                .OrderBy(port => port)
                .ToArray();
        }
        catch
        {
            return [];
        }
    }

    private static string[] GetLinklyProcesses()
    {
        var matches = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var process in Process.GetProcesses())
        {
            try
            {
                var name = process.ProcessName;
                if (LinklyProcessNames.Any(candidate => name.Contains(candidate, StringComparison.OrdinalIgnoreCase)))
                {
                    matches.Add(name);
                }
            }
            catch
            {
                // A process may exit while the diagnostic snapshot is being collected.
            }
            finally
            {
                process.Dispose();
            }
        }

        return matches.OrderBy(name => name, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private static async Task<LinklyHttpCandidate[]> ProbeHttpCandidatesAsync(int[] listeners, CancellationToken cancellationToken)
    {
        var excludedPorts = new HashSet<int> { 2005, 2011, 9167, 9170 };
        using var gate = new SemaphoreSlim(12);
        var probes = listeners.Where(port => !excludedPorts.Contains(port)).Select(async port =>
        {
            await gate.WaitAsync(cancellationToken);
            try
            {
                foreach (var path in new[] { "/v1/health", "/health", "/status" })
                {
                    var candidate = await ProbeAsync(port, path, cancellationToken);
                    if (candidate is not null) return candidate;
                }
                return null;
            }
            finally
            {
                gate.Release();
            }
        });

        var results = await Task.WhenAll(probes);
        return results.Where(candidate => candidate is not null).Select(candidate => candidate!).ToArray();
    }

    private static async Task<LinklyHttpCandidate?> ProbeAsync(int port, string path, CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, $"http://127.0.0.1:{port}{path}");
            using var response = await ProbeClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (!response.IsSuccessStatusCode) return null;
            var mediaType = response.Content.Headers.ContentType?.MediaType;
            if (mediaType is null || !mediaType.Contains("json", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            await using var bodyStream = await response.Content.ReadAsStreamAsync(cancellationToken);
            var body = await BoundedResponseReader.ReadAsync(bodyStream, response.Content.Headers.ContentLength, cancellationToken, 32_768);
            var json = JsonDocument.Parse(body);
            var keys = json.RootElement.ValueKind == JsonValueKind.Object
                ? json.RootElement.EnumerateObject().Select(property => property.Name).ToArray()
                : [];
            return new LinklyHttpCandidate(port, $"http://127.0.0.1:{port}", path, (int)response.StatusCode, keys);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or InvalidDataException)
        {
            return null;
        }
    }
}

internal sealed record LinklyDiscoveryResult(
    string State,
    string[] LinklyProcesses,
    bool LinklyPort2005Listening,
    int[] LinklyTcpListenPorts,
    LinklyHttpCandidate[] HttpCandidates,
    DateTimeOffset CheckedAtUtc);

internal sealed record LinklyHttpCandidate(
    int Port,
    string BaseUrl,
    string HealthPath,
    int StatusCode,
    string[] JsonKeys);
