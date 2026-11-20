using System.Diagnostics;
using Microsoft.Win32;

namespace Orithos.HardwareConnect;

internal static class RegisterAgentInstaller
{
    private const string TaskName = "Orithos Hardware Connect";
    private const string RunKeyName = "OrithosHardwareConnect";
    private const string SettingsUrlEnv = "ORITHOS_HC_SETTINGS_URL";
    private const string DefaultSettingsUrl = "https://skr.orithos.com.au/settings/hardware";
    private const string UninstallRegistryKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\OrithosHardwareConnect";

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

        var runningExe = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(runningExe) || !File.Exists(runningExe))
        {
            throw new InvalidOperationException("Could not locate the installer executable.");
        }

        Directory.CreateDirectory(InstallDir);
        StopRunningAgent();
        Thread.Sleep(500);

        File.Copy(runningExe, InstalledExePath, overwrite: true);

        foreach (var file in Directory.EnumerateFiles(sourceDir))
        {
            var name = Path.GetFileName(file);
            if (string.Equals(name, "install.ps1", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "uninstall.ps1", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "REGISTER-README.txt", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "Install-Orithos-Hardware-Connect.cmd", StringComparison.OrdinalIgnoreCase)
                || name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            File.Copy(file, Path.Combine(InstallDir, name), overwrite: true);
        }

        if (!File.Exists(InstalledExePath))
        {
            throw new InvalidOperationException($"Could not install agent at {InstalledExePath}.");
        }

        RegisterStartup(InstalledExePath);
        Environment.SetEnvironmentVariable(SettingsUrlEnv, resolvedSettingsUrl, EnvironmentVariableTarget.User);
        RegisterProgramsAndFeatures(InstalledExePath);
    }

    public static void Uninstall()
    {
        DeleteProgramsAndFeatures();
        DeleteScheduledTask();
        DeleteRunKey();
        StopRunningAgent();
        Thread.Sleep(500);

        if (Directory.Exists(InstallDir))
        {
            try
            {
                Directory.Delete(InstallDir, recursive: true);
            }
            catch
            {
                foreach (var file in Directory.EnumerateFiles(InstallDir, "*", SearchOption.AllDirectories))
                {
                    try
                    {
                        File.SetAttributes(file, FileAttributes.Normal);
                        File.Delete(file);
                    }
                    catch
                    {
                        /* best effort */
                    }
                }

                try
                {
                    Directory.Delete(InstallDir, recursive: true);
                }
                catch
                {
                    /* leave partial tree; user can delete folder manually */
                }
            }
        }

        Environment.SetEnvironmentVariable(SettingsUrlEnv, null, EnvironmentVariableTarget.User);
        Environment.SetEnvironmentVariable("ORITHOS_CONNECTOR_TOKEN", null, EnvironmentVariableTarget.User);
        Environment.SetEnvironmentVariable("ORITHOS_API_URL", null, EnvironmentVariableTarget.User);
    }

    public static void RequestUninstallFromTray()
    {
        if (File.Exists(InstalledExePath))
        {
            Process.Start(new ProcessStartInfo(InstalledExePath, "--uninstall")
            {
                UseShellExecute = true,
                WorkingDirectory = InstallDir,
            });
            return;
        }

        Uninstall();
    }

    public static void LaunchInstalledAgent()
    {
        if (!File.Exists(InstalledExePath))
        {
            throw new FileNotFoundException("Installed agent is missing.", InstalledExePath);
        }

        Process.Start(new ProcessStartInfo(InstalledExePath)
        {
            UseShellExecute = true,
            WorkingDirectory = InstallDir,
        });
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

    private static void RegisterProgramsAndFeatures(string exePath)
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(UninstallRegistryKey, writable: true);
            if (key is null) return;
            key.SetValue("DisplayName", AgentVersion.Product);
            key.SetValue("DisplayVersion", AgentVersion.DisplayVersion);
            key.SetValue("Publisher", "Orithos");
            key.SetValue("InstallLocation", InstallDir);
            key.SetValue("UninstallString", $"\"{exePath}\" --uninstall");
            key.SetValue("QuietUninstallString", $"\"{exePath}\" --uninstall");
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        }
        catch
        {
            /* non-fatal */
        }
    }

    private static void DeleteProgramsAndFeatures()
    {
        try
        {
            Registry.CurrentUser.DeleteSubKey(UninstallRegistryKey, throwOnMissingSubKey: false);
        }
        catch
        {
            /* ignore */
        }
    }
}