using System.Reflection;
using System.Text.Json;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class SupportLogTests
{
    [Fact]
    public void WritesBoundedStructuredEventsWithoutExceptionMessages()
    {
        WithDirectory(directory =>
        {
            var timestamp = new DateTimeOffset(2026, 11, 25, 12, 30, 0, TimeSpan.Zero);
            WriteRecord(directory, "error", "eftpos.adapter.request-failed", new InvalidOperationException("secret-token-value"), timestamp, 4096);

            var line = File.ReadAllLines(Directory.GetFiles(directory, "*.log").Single()).Single();
            using var json = JsonDocument.Parse(line);

            Assert.Equal("error", json.RootElement.GetProperty("level").GetString());
            Assert.Equal("eftpos.adapter.request-failed", json.RootElement.GetProperty("eventName").GetString());
            Assert.Equal("InvalidOperationException", json.RootElement.GetProperty("exceptionType").GetString());
            Assert.DoesNotContain("secret-token-value", line);
        });
    }

    [Fact]
    public void RotatesWhenDailyFileReachesConfiguredLimit()
    {
        WithDirectory(directory =>
        {
            var timestamp = new DateTimeOffset(2026, 11, 25, 12, 30, 0, TimeSpan.Zero);
            WriteRecord(directory, "info", "client.one", null, timestamp, 160);
            WriteRecord(directory, "info", "client.two", null, timestamp, 160);

            var files = Directory.GetFiles(directory, "*.log");

            Assert.Equal(2, files.Length);
            Assert.All(files, file => Assert.True(new FileInfo(file).Length <= 160));
        });
    }

    [Fact]
    public void RemovesLogsOlderThanRetentionWindow()
    {
        WithDirectory(directory =>
        {
            var expired = Path.Combine(directory, "hardware-connect-old.log");
            var recent = Path.Combine(directory, "hardware-connect-recent.log");
            File.WriteAllText(expired, "old");
            File.WriteAllText(recent, "recent");
            File.SetLastWriteTimeUtc(expired, new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
            File.SetLastWriteTimeUtc(recent, new DateTime(2026, 11, 24, 0, 0, 0, DateTimeKind.Utc));

            PurgeOld(directory, new DateTimeOffset(2026, 11, 25, 0, 0, 0, TimeSpan.Zero), 30);

            Assert.False(File.Exists(expired));
            Assert.True(File.Exists(recent));
        });
    }

    private static void WriteRecord(string directory, string level, string eventName, Exception? exception, DateTimeOffset timestamp, long limit)
    {
        var type = Assembly.Load("OrithosHardwareConnect").GetType("Orithos.HardwareConnect.SupportLog", throwOnError: true)!;
        var method = type.GetMethod("WriteRecord", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        method.Invoke(null, [directory, level, eventName, exception?.GetType().Name, timestamp, limit]);
    }

    private static void PurgeOld(string directory, DateTimeOffset now, int retentionDays)
    {
        var type = Assembly.Load("OrithosHardwareConnect").GetType("Orithos.HardwareConnect.SupportLog", throwOnError: true)!;
        var method = type.GetMethod("PurgeOldLogs", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        method.Invoke(null, [directory, now, retentionDays]);
    }

    private static void WithDirectory(Action<string> action)
    {
        var directory = Path.Combine(Path.GetTempPath(), $"orithos-hc-log-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        try
        {
            action(directory);
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }
}
