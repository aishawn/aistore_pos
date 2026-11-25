using System.Diagnostics;
using System.Reflection;
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

        var configuredUrl = Environment.GetEnvironmentVariable(SettingsUrlEnv);
        if (!string.IsNullOrWhiteSpace(configuredUrl))
        {
            return configuredUrl;
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

    public static void Install(string? settingsUrl = null, IProgress<InstallProgress>? progress = null)
    {
        progress?.Report(new InstallProgress("Preparing", 5));
        if (IsRunningFromInstallDir())
        {
            throw new InvalidOperationException("Close the running tray app and launch the downloaded setup file to update Hardware Connect.");
        }

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

        var hadInstalledAgent = IsInstalled();
        if (hadInstalledAgent)
        {
            var candidateVersion = Assembly.GetExecutingAssembly().GetName().Version ?? new Version(1, 0, 0, 0);
            var installedVersionText = FileVersionInfo.GetVersionInfo(InstalledExePath).FileVersion;
            var installedVersion = InstallVersionPolicy.ParseInstalledVersion(installedVersionText);
            InstallVersionPolicy.EnsureNotDowngrade(candidateVersion, installedVersion);
        }

        var installParent = Path.GetDirectoryName(InstallDir)!;
        var stagingDirectory = Path.Combine(installParent, $".HardwareConnect-staging-{Guid.NewGuid():N}");
        Directory.CreateDirectory(stagingDirectory);
        try
        {
            File.Copy(runningExe, Path.Combine(stagingDirectory, "OrithosHardwareConnect.exe"));
            foreach (var assetName in new[] { "orithos-hc-logo.png", "orithos-hc.ico" })
            {
                var sourceAsset = Path.Combine(sourceDir, "assets", assetName);
                if (!File.Exists(sourceAsset)) continue;
                var stagedAsset = Path.Combine(stagingDirectory, "assets", assetName);
                Directory.CreateDirectory(Path.GetDirectoryName(stagedAsset)!);
                File.Copy(sourceAsset, stagedAsset);
            }

            progress?.Report(new InstallProgress("StoppingAgent", 30));
            StopRunningAgent();
            try
            {
                var payloadFiles = Directory.EnumerateFiles(stagingDirectory, "*", SearchOption.AllDirectories)
                    .Select(path => Path.GetRelativePath(stagingDirectory, path))
                    .ToArray();
                progress?.Report(new InstallProgress("ReplacingFiles", 55));
                InstallFileTransaction.ReplaceFiles(stagingDirectory, InstallDir, payloadFiles);

                if (!File.Exists(InstalledExePath))
                {
                    throw new InvalidOperationException($"Could not install agent at {InstalledExePath}.");
                }

                progress?.Report(new InstallProgress("RegisteringStartup", 82));
                RegisterStartup(InstalledExePath);
                Environment.SetEnvironmentVariable(SettingsUrlEnv, resolvedSettingsUrl, EnvironmentVariableTarget.User);
                RegisterProgramsAndFeatures(InstalledExePath);
            }
            catch (InstallRollbackException)
            {
                throw;
            }
            catch (Exception installFailure)
            {
                if (hadInstalledAgent && File.Exists(InstalledExePath))
                {
                    try
                    {
                        LaunchInstalledAgent();
                    }
                    catch (Exception restartFailure)
                    {
                        throw new AggregateException("The update failed and the previous agent could not be restarted.", installFailure, restartFailure);
                    }
                }

                throw;
            }
        }
        finally
        {
            try
            {
                if (Directory.Exists(stagingDirectory)) Directory.Delete(stagingDirectory, recursive: true);
            }
            catch
            {
                /* A later setup run can remove abandoned staging files. */
            }
        }
    }

    public static void Uninstall()
    {
        DeleteProgramsAndFeatures();
        DeleteScheduledTask();
        DeleteRunKey();
        StopRunningAgent();
        Environment.SetEnvironmentVariable(SettingsUrlEnv, null, EnvironmentVariableTarget.User);
        Environment.SetEnvironmentVariable("ORITHOS_CONNECTOR_TOKEN", null, EnvironmentVariableTarget.User);
        Environment.SetEnvironmentVariable("ORITHOS_API_URL", null, EnvironmentVariableTarget.User);
        ScheduleInstallDirectoryDeletion();
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

    public static bool WaitForLocalServicesReady(TimeSpan timeout)
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        return LocalApiHealthProbe.WaitForBothReadyAsync(
            Environment.GetEnvironmentVariable("ORITHOS_HC_URL") ?? AgentVersion.DefaultListen,
            Environment.GetEnvironmentVariable("ORITHOS_CONNECTOR_URL") ?? AgentVersion.DefaultEftposListen,
            client,
            timeout,
            CancellationToken.None).GetAwaiter().GetResult();
    }

    private static void StopRunningAgent()
    {
        var currentProcessId = Environment.ProcessId;
        foreach (var process in Process.GetProcessesByName("OrithosHardwareConnect"))
        {
            using (process)
            {
                string? executablePath;
                try
                {
                    executablePath = process.MainModule?.FileName;
                }
                catch
                {
                    continue;
                }

                if (!AgentProcessPolicy.ShouldStop(process.Id, executablePath, InstalledExePath, currentProcessId)) continue;
                try
                {
                    if (!process.HasExited) process.Kill(entireProcessTree: true);
                }
                catch (InvalidOperationException) when (process.HasExited)
                {
                }

                if (!process.WaitForExit(15_000))
                {
                    throw new TimeoutException("The running Hardware Connect process did not stop for the update.");
                }
            }
        }
    }

    private static void ScheduleInstallDirectoryDeletion()
    {
        var windowsDirectory = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        var powershell = Path.Combine(windowsDirectory, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
        if (!File.Exists(powershell))
        {
            throw new FileNotFoundException("Windows PowerShell is required to finish removing the running application files.", powershell);
        }

        var cleanupScript = Path.Combine(Path.GetTempPath(), $"orithos-hc-uninstall-{Guid.NewGuid():N}.ps1");
        File.WriteAllText(cleanupScript, """
            param([int]$ProcessId, [string]$InstallDir)
            try { Wait-Process -Id $ProcessId -Timeout 30 -ErrorAction SilentlyContinue } catch {}
            for ($attempt = 0; $attempt -lt 20 -and (Test-Path -LiteralPath $InstallDir); $attempt++) {
              try { Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction Stop } catch {}
              if (Test-Path -LiteralPath $InstallDir) { Start-Sleep -Milliseconds 500 }
            }
            if (Test-Path -LiteralPath $InstallDir) { exit 1 }
            Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
            """);

        try
        {
            var process = new ProcessStartInfo(powershell)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            };
            process.ArgumentList.Add("-NoProfile");
            process.ArgumentList.Add("-NonInteractive");
            process.ArgumentList.Add("-ExecutionPolicy");
            process.ArgumentList.Add("Bypass");
            process.ArgumentList.Add("-File");
            process.ArgumentList.Add(cleanupScript);
            process.ArgumentList.Add(Environment.ProcessId.ToString());
            process.ArgumentList.Add(InstallDir);
            Process.Start(process)?.Dispose();
        }
        catch
        {
            try { File.Delete(cleanupScript); } catch { }
            throw;
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
