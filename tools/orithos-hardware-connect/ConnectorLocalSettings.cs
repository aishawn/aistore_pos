using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Orithos.HardwareConnect;

internal sealed class ConnectorLocalSettings
{
    private readonly object gate = new();
    private readonly string settingsFilePath;

    public string OrithosApiUrl { get; private set; }

    public string ConnectorToken { get; private set; }

    public bool TokenRecoveryRequired { get; private set; }

    private static readonly byte[] TokenEntropy = Encoding.UTF8.GetBytes("Orithos Hardware Connect connector token v1");

    private ConnectorLocalSettings(string orithosApiUrl, string connectorToken, string settingsFilePath, bool tokenRecoveryRequired)
    {
        OrithosApiUrl = orithosApiUrl;
        ConnectorToken = connectorToken;
        this.settingsFilePath = settingsFilePath;
        TokenRecoveryRequired = tokenRecoveryRequired;
    }

    public static string SettingsFilePath { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Orithos",
        "HardwareConnect",
        "connector-settings.json");

    public static ConnectorLocalSettings Load(string? filePath = null)
    {
        var resolvedFilePath = filePath ?? SettingsFilePath;
        var envUrl = (Environment.GetEnvironmentVariable("ORITHOS_API_URL") ?? "http://127.0.0.1:8080").TrimEnd('/');
        var envToken = Environment.GetEnvironmentVariable("ORITHOS_CONNECTOR_TOKEN") ?? "";
        var tokenRecoveryRequired = false;
        var migratePlaintextToken = false;
        if (File.Exists(resolvedFilePath))
        {
            try
            {
                var json = JsonSerializer.Deserialize<PersistedConnectorSettings>(File.ReadAllText(resolvedFilePath),
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (json is not null)
                {
                    if (!string.IsNullOrWhiteSpace(json.OrithosApiUrl)) envUrl = json.OrithosApiUrl.TrimEnd('/');
                    tokenRecoveryRequired = json.TokenRecoveryRequired;
                    if (!string.IsNullOrWhiteSpace(json.ProtectedConnectorToken))
                    {
                        try
                        {
                            var protectedToken = Convert.FromBase64String(json.ProtectedConnectorToken);
                            envToken = Encoding.UTF8.GetString(ProtectedData.Unprotect(protectedToken, TokenEntropy, DataProtectionScope.CurrentUser));
                        }
                        catch (CryptographicException)
                        {
                            envToken = "";
                            tokenRecoveryRequired = true;
                        }
                        catch (FormatException)
                        {
                            envToken = "";
                            tokenRecoveryRequired = true;
                        }
                    }
                    else if (!string.IsNullOrWhiteSpace(json.ConnectorToken))
                    {
                        envToken = json.ConnectorToken;
                        migratePlaintextToken = true;
                    }
                }
            }
            catch
            {
                /* ignore corrupt file */
            }
        }

        if (tokenRecoveryRequired) envToken = "";
        var settings = new ConnectorLocalSettings(envUrl, envToken, resolvedFilePath, tokenRecoveryRequired);
        if (migratePlaintextToken) settings.Persist();
        return settings;
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
                TokenRecoveryRequired = false;
            }

            if (persist)
            {
                Persist();
            }
        }
    }

    private void Persist()
    {
        var directory = Path.GetDirectoryName(settingsFilePath)!;
        Directory.CreateDirectory(directory);
        var protectedToken = string.IsNullOrWhiteSpace(ConnectorToken)
            ? null
            : Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(ConnectorToken), TokenEntropy, DataProtectionScope.CurrentUser));
        var payload = JsonSerializer.Serialize(new PersistedConnectorSettings
        {
            OrithosApiUrl = OrithosApiUrl,
            ProtectedConnectorToken = protectedToken,
            TokenRecoveryRequired = TokenRecoveryRequired,
        });
        var temporaryPath = $"{settingsFilePath}.{Guid.NewGuid():N}.tmp";
        try
        {
            File.WriteAllText(temporaryPath, payload);
            File.Move(temporaryPath, settingsFilePath, overwrite: true);
        }
        finally
        {
            if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
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

    private sealed class PersistedConnectorSettings
    {
        public string? OrithosApiUrl { get; init; }

        public string? ProtectedConnectorToken { get; init; }

        public bool TokenRecoveryRequired { get; init; }

        public string? ConnectorToken { get; init; }
    }
}
