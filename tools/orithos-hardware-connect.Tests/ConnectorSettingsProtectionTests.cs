using System.Reflection;
using System.Text.Json;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class ConnectorSettingsProtectionTests
{
    [Fact]
    public void PersistsEncryptedTokenAndCanReloadItForTheSameWindowsUser()
    {
        WithSettingsFile(path =>
        {
            var settings = LoadSettings(path);
            Apply(settings, "https://skr.orithos.com.au", "connector-secret-value");

            var saved = File.ReadAllText(path);
            Assert.DoesNotContain("connector-secret-value", saved);
            using var json = JsonDocument.Parse(saved);
            Assert.True(json.RootElement.TryGetProperty("ProtectedConnectorToken", out var encrypted));
            Assert.NotEqual("connector-secret-value", encrypted.GetString());

            Assert.Equal("connector-secret-value", SnapshotToken(LoadSettings(path)));
        });
    }

    [Fact]
    public void MigratesExistingPlaintextTokenToProtectedStorage()
    {
        WithSettingsFile(path =>
        {
            File.WriteAllText(path, "{\"OrithosApiUrl\":\"https://skr.orithos.com.au\",\"ConnectorToken\":\"legacy-token\"}");

            var settings = LoadSettings(path);

            Assert.Equal("legacy-token", SnapshotToken(settings));
            var saved = File.ReadAllText(path);
            Assert.DoesNotContain("legacy-token", saved);
            Assert.Contains("ProtectedConnectorToken", saved);
        });
    }

    [Fact]
    public void MarksTokenForReentryWhenCurrentWindowsUserCannotDecryptIt()
    {
        WithSettingsFile(path =>
        {
            var invalidCiphertext = Convert.ToBase64String([1, 2, 3, 4]);
            File.WriteAllText(path, JsonSerializer.Serialize(new
            {
                OrithosApiUrl = "https://skr.orithos.com.au",
                ProtectedConnectorToken = invalidCiphertext,
            }));

            var settings = LoadSettings(path);

            Assert.Equal("", SnapshotToken(settings));
            Assert.True(ReadBooleanProperty(settings, "TokenRecoveryRequired"));
        });
    }

    private static void WithSettingsFile(Action<string> action)
    {
        var path = Path.Combine(Path.GetTempPath(), $"orithos-hc-settings-{Guid.NewGuid():N}.json");
        var originalToken = Environment.GetEnvironmentVariable("ORITHOS_CONNECTOR_TOKEN");
        Environment.SetEnvironmentVariable("ORITHOS_CONNECTOR_TOKEN", null);
        try
        {
            action(path);
        }
        finally
        {
            Environment.SetEnvironmentVariable("ORITHOS_CONNECTOR_TOKEN", originalToken);
            if (File.Exists(path)) File.Delete(path);
        }
    }

    private static object LoadSettings(string path)
    {
        var settingsType = Assembly.Load("OrithosHardwareConnect")
            .GetType("Orithos.HardwareConnect.ConnectorLocalSettings", throwOnError: true)!;
        var load = settingsType.GetMethod("Load", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static, [typeof(string)]);
        Assert.NotNull(load);
        return load.Invoke(null, [path])!;
    }

    private static void Apply(object settings, string apiUrl, string token)
    {
        var apply = settings.GetType().GetMethod("Apply", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)!;
        apply.Invoke(settings, [apiUrl, token, true]);
    }

    private static string SnapshotToken(object settings)
    {
        var snapshot = settings.GetType().GetMethod("Snapshot", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)!
            .Invoke(settings, null)!;
        return (string)snapshot.GetType().GetField("Item2")!.GetValue(snapshot)!;
    }

    private static bool ReadBooleanProperty(object value, string name)
    {
        return (bool)value.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)!
            .GetValue(value)!;
    }
}
