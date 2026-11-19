using System.Text.Json;

namespace Orithos.HardwareConnect;

internal sealed class ConnectorLocalSettings
{
    private readonly object gate = new();

    public string OrithosApiUrl { get; private set; }

    public string ConnectorToken { get; private set; }

    private ConnectorLocalSettings(string orithosApiUrl, string connectorToken)
    {
        OrithosApiUrl = orithosApiUrl;
        ConnectorToken = connectorToken;
    }

    public static string SettingsFilePath { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Orithos",
        "HardwareConnect",
        "connector-settings.json");

    public static ConnectorLocalSettings Load()
    {
        var envUrl = (Environment.GetEnvironmentVariable("ORITHOS_API_URL") ?? "http://127.0.0.1:8080").TrimEnd('/');
        var envToken = Environment.GetEnvironmentVariable("ORITHOS_CONNECTOR_TOKEN") ?? "";
        if (File.Exists(SettingsFilePath))
        {
            try
            {
                var json = JsonSerializer.Deserialize<PersistedConnectorSettings>(File.ReadAllText(SettingsFilePath));
                if (json is not null)
                {
                    if (!string.IsNullOrWhiteSpace(json.OrithosApiUrl)) envUrl = json.OrithosApiUrl.TrimEnd('/');
                    if (!string.IsNullOrWhiteSpace(json.ConnectorToken)) envToken = json.ConnectorToken;
                }
            }
            catch
            {
                /* ignore corrupt file */
            }
        }

        return new ConnectorLocalSettings(envUrl, envToken);
    }

    public void Apply(string? orithosApiUrl, string? connectorToken, bool persist)
    {
        lock (gate)
        {
            if (!string.IsNullOrWhiteSpace(orithosApiUrl))
            {
                OrithosApiUrl = orithosApiUrl.TrimEnd('/');
            }

            if (!string.IsNullOrWhiteSpace(connectorToken))
            {
                ConnectorToken = connectorToken.Trim();
            }

            if (persist)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(SettingsFilePath)!);
                var payload = JsonSerializer.Serialize(new PersistedConnectorSettings(OrithosApiUrl, ConnectorToken));
                File.WriteAllText(SettingsFilePath, payload);
            }
        }
    }

    public bool HasConnectorToken()
    {
        lock (gate)
        {
            return !string.IsNullOrWhiteSpace(ConnectorToken);
        }
    }

    public (string ApiUrl, string Token) Snapshot()
    {
        lock (gate)
        {
            return (OrithosApiUrl, ConnectorToken);
        }
    }

    private sealed record PersistedConnectorSettings(string OrithosApiUrl, string ConnectorToken);
}