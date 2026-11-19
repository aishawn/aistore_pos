using System.Diagnostics;
using Microsoft.Win32;

namespace Orithos.HardwareConnect;

internal static class RegisterAgentInstaller
{
    private const string TaskName = "Orithos Hardware Connect";
    private const string RunKeyName = "OrithosHardwareConnect";
    private const string SettingsUrlEnv = "ORITHOS_HC_SETTINGS_URL";
    private const string DefaultSettingsUrl = "https://skr.orithos.com.au/settings/hardware";

    public static string InstallDir { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Orithos",
        "HardwareConnect");

    public static string InstalledExePath => Path.Combine(InstallDir, "OrithosHardwareConnect.exe");

    public static bool IsInstalled() => File.Exists(InstalledExePath);

    public static bool IsRunningFromInstallDir()
    {
        var current = Path.GetDirectoryName(Environment.ProcessPath ?? AppContext.BaseDirectory);
        if (string.IsNullOrWhiteSpace(current)) return false;
        return string.Equals(Path.GetFullPath(current), Path.GetFullPath(InstallDir), StringComparison.OrdinalIgnoreCase);
    }

    public static string ResolveSettingsUrl(string? explicitUrl)
    {
        if (!string.IsNullOrWhiteSpace(explicitUrl))
        {
            return explicitUrl;
        }

        var sourceDir = Path.GetDirectoryName(Environment.ProcessPath ?? AppContext.BaseDirectory);
        if (!string.IsNullOrWhiteSpace(sourceDir))
        {
            var sidecar = Path.Combine(sourceDir, "orithos-hc-settings.url");
            if (File.Exists(sidecar))
            {
                var fromFile = File.ReadAllText(sidecar).Trim();
                if (!string.IsNullOrWhiteSpace(fromFile))
                {
                    return fromFile;
                }
            }
        }

        return DefaultSettingsUrl;
    }

    public static void Install(string? settingsUrl = null)
    {
        var resolvedSettingsUrl = ResolveSettingsUrl(settingsUrl);
        var sourceDir = Path.GetDirectoryName(Environment.ProcessPath ?? AppContext.BaseDirectory);
        if (string.IsNullOrWhiteSpace(sourceDir))
        {
            throw new InvalidOperationException("Could not resolve the installer location.");
        }

        Directory.CreateDirectory(InstallDir);
        StopRunningAgent();
        Thread.Sleep(500);

        foreach (var file in Directory.EnumerateFiles(sourceDir))
        {
            var name = Path.GetFileName(file);
            if (string.Equals(name, "install.ps1", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "uninstall.ps1", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "REGISTER-README.txt", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "Install-Orithos-Hardware-Connect.cmd", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            File.Copy(file, Path.Combine(InstallDir, name), overwrite: true);
        }

        RegisterStartup(InstalledExePath);
        Environment.SetEnvironmentVariable(SettingsUrlEnv, resolvedSettingsUrl, EnvironmentVariableTarget.User);
    }

    public static void Uninstall()
    {
        DeleteScheduledTask();
        DeleteRunKey();
        StopRunningAgent();
        if (Directory.Exists(InstallDir))
        {
            Directory.Delete(InstallDir, recursive: true);
        }

        Environment.SetEnvironmentVariable(SettingsUrlEnv, null, EnvironmentVariableTarget.User);
    }

    public static void LaunchInstalledAgent()
    {
        Process.Start(new ProcessStartInfo(InstalledExePath) { UseShellExecute = true });
    }

    private static void StopRunningAgent()
    {
        foreach (var process in Process.GetProcessesByName("OrithosHardwareConnect"))
        {
            try
            {
                process.Kill(entireProcessTree: true);
            }
            catch
            {
                /* best effort */
            }
        }
    }

    private static void RegisterStartup(string exePath)
    {
        DeleteScheduledTask();
        if (TryCreateScheduledTask(exePath))
        {
            return;
        }

        DeleteRunKey();
        var runKey = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", writable: true);
        runKey?.SetValue(RunKeyName, $"\"{exePath}\"");
    }

    private static bool TryCreateScheduledTask(string exePath)
    {
        try
        {
            var args = $"/Create /TN \"{TaskName}\" /SC ONLOGON /TR \"\\\"{exePath}\\\"\" /RL LIMITED /F";
            using var process = Process.Start(new ProcessStartInfo("schtasks.exe", args)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
            });
            process?.WaitForExit(15_000);
            return process is { ExitCode: 0 };
        }
        catch
        {
            return false;
        }
    }

    private static void DeleteScheduledTask()
    {
        try
        {
            using var process = Process.Start(new ProcessStartInfo("schtasks.exe", $"/Delete /TN \"{TaskName}\" /F")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            });
            process?.WaitForExit(10_000);
        }
        catch
        {
            /* ignore */
        }
    }

    private static void DeleteRunKey()
    {
        try
        {
            var runKey = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", writable: true);
            runKey?.DeleteValue(RunKeyName, throwOnMissingValue: false);
        }
        catch
        {
            /* ignore */
        }
    }
}