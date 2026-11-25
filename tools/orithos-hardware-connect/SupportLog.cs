using System.Text;
using System.Text.Json;

namespace Orithos.HardwareConnect;

internal static class SupportLog
{
    private const long MaximumLogFileBytes = 2 * 1024 * 1024;
    private const int RetentionDays = 30;
    private static readonly object Gate = new();

    public static string LogDirectoryPath { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Orithos",
        "HardwareConnect",
        "logs");

    public static void Initialize()
    {
        try
        {
            Directory.CreateDirectory(LogDirectoryPath);
            PurgeOldLogs(LogDirectoryPath, DateTimeOffset.UtcNow, RetentionDays);
        }
        catch
        {
        }
    }

    public static void Record(string level, string eventName, Exception? exception = null)
    {
        try
        {
            lock (Gate)
            {
                WriteRecord(
                    LogDirectoryPath,
                    level,
                    eventName,
                    exception?.GetType().Name,
                    DateTimeOffset.UtcNow,
                    MaximumLogFileBytes);
            }
        }
        catch
        {
        }
    }

    private static void WriteRecord(
        string directory,
        string level,
        string eventName,
        string? exceptionType,
        DateTimeOffset timestamp,
        long maximumFileBytes)
    {
        Directory.CreateDirectory(directory);
        var record = JsonSerializer.Serialize(new
        {
            timestamp = timestamp.ToUniversalTime(),
            level = SafeToken(level),
            eventName = SafeToken(eventName),
            version = AgentVersion.DisplayVersion,
            exceptionType = exceptionType is null ? null : SafeToken(exceptionType),
        });
        var bytes = Encoding.UTF8.GetBytes(record + Environment.NewLine);
        var stem = $"hardware-connect-{timestamp.UtcDateTime:yyyyMMdd}";
        string? path = null;
        for (var index = 0; index < 100; index++)
        {
            var candidate = Path.Combine(directory, index == 0 ? $"{stem}.log" : $"{stem}-{index}.log");
            if (!File.Exists(candidate) || new FileInfo(candidate).Length + bytes.Length <= maximumFileBytes)
            {
                path = candidate;
                break;
            }
        }

        if (path is null) return;
        using var stream = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
        stream.Write(bytes);
    }

    private static void PurgeOldLogs(string directory, DateTimeOffset now, int retentionDays)
    {
        var cutoff = now.AddDays(-retentionDays);
        foreach (var path in Directory.EnumerateFiles(directory, "hardware-connect-*.log"))
        {
            try
            {
                if (File.GetLastWriteTimeUtc(path) < cutoff.UtcDateTime) File.Delete(path);
            }
            catch
            {
            }
        }
    }

    private static string SafeToken(string value) => new(value
        .Where(character => char.IsAsciiLetterOrDigit(character) || character is '.' or '_' or '-')
        .Take(80)
        .ToArray());
}
