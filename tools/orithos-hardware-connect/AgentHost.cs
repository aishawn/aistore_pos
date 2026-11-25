namespace Orithos.HardwareConnect;

internal static class AgentHost
{
    private const string SingleInstanceMutexName = @"Local\OrithosHardwareConnect";
    private const string ConsoleMutexName = @"Local\OrithosHardwareConnectConsole";

    private static bool IsSetupBootstrapper()
    {
        var name = Path.GetFileName(Environment.ProcessPath ?? "");
        return name.Contains("Setup", StringComparison.OrdinalIgnoreCase)
            && name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase);
    }

    public static int Run(string[] args)
    {
        if (AgentRunModePolicy.IsConsoleMode(args, Environment.GetEnvironmentVariable("ORITHOS_HC_CONSOLE")))
        {
            return RunConsoleMode();
        }

        if (args.Contains("--uninstall", StringComparer.OrdinalIgnoreCase))
        {
            RegisterAgentInstaller.Uninstall();
            MessageBox.Show(
                $"{AgentVersion.Product} is stopping. Its program files will be removed in the background.",
                AgentVersion.Product,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return 0;
        }

        var settingsUrlArg = args.FirstOrDefault(a => a.StartsWith("--settings-url=", StringComparison.OrdinalIgnoreCase));
        var settingsUrl = settingsUrlArg is null ? null : settingsUrlArg[(settingsUrlArg.IndexOf('=') + 1)..];

        if (args.Contains("--install", StringComparer.OrdinalIgnoreCase))
        {
            return RunInstallFlow(settingsUrl);
        }

        if (!RegisterAgentInstaller.IsRunningFromInstallDir())
        {
            if (IsSetupBootstrapper() && !args.Contains("--install", StringComparer.OrdinalIgnoreCase))
            {
                if (RegisterAgentInstaller.IsInstalled())
                {
                    return RunInstallFlow(settingsUrl);
                }

                ApplicationConfiguration.Initialize();
                using var wizard = new SetupWizardForm(RegisterAgentInstaller.ResolveSettingsUrl(settingsUrl));
                wizard.ShowDialog();
                return 0;
            }

            if (!RegisterAgentInstaller.IsInstalled())
            {
                return RunInstallFlow(settingsUrl);
            }

            RegisterAgentInstaller.LaunchInstalledAgent();
            return 0;
        }

        using var mutex = new Mutex(true, SingleInstanceMutexName, out var createdNew);
        if (!createdNew)
        {
            MessageBox.Show(
                $"{AgentVersion.Product} is already running on this register.",
                AgentVersion.Product,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return 0;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new TrayApplicationContext());
        return 0;
    }

    private static int RunConsoleMode()
    {
        using var mutex = new Mutex(true, ConsoleMutexName, out var createdNew);
        if (!createdNew)
        {
            Console.Error.WriteLine($"{AgentVersion.Product} is already running on this register.");
            return 1;
        }

        var hcUrl = Environment.GetEnvironmentVariable("ORITHOS_HC_URL") ?? AgentVersion.DefaultListen;
        var eftposUrl = Environment.GetEnvironmentVariable("ORITHOS_CONNECTOR_URL") ?? AgentVersion.DefaultEftposListen;
        Console.WriteLine($"{AgentVersion.Product} {AgentVersion.DisplayVersion}");
        Console.WriteLine($"Printers: {hcUrl}");
        Console.WriteLine($"EFTPOS:   {eftposUrl}");
        Task.WhenAll(
            HardwareConnectWebApp.RunAsync(CancellationToken.None),
            LinklyConnectorWebApp.RunAsync(CancellationToken.None)).GetAwaiter().GetResult();
        return 0;
    }

    private static int RunInstallFlow(string? settingsUrl)
    {
        var isUpdate = RegisterAgentInstaller.IsInstalled();
        var confirm = MessageBox.Show(
            InstallerPromptPolicy.GetConfirmationMessage(isUpdate),
            isUpdate ? $"Update {AgentVersion.Product}" : $"Install {AgentVersion.Product}",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning,
            MessageBoxDefaultButton.Button2);
        if (confirm != DialogResult.Yes)
        {
            return 2;
        }

        try
        {
            RegisterAgentInstaller.Install(settingsUrl);
            RegisterAgentInstaller.LaunchInstalledAgent();
            if (!RegisterAgentInstaller.WaitForLocalServicesReady(TimeSpan.FromSeconds(20)))
            {
                throw new InvalidOperationException("Hardware Connect started, but one or both local services did not become ready within 20 seconds.");
            }

            SupportLog.Record("info", "installer.install-verified");
            MessageBox.Show(
                "Installation complete. The register agent is starting now.\n\nIf Windows Firewall asks, allow access on private networks.",
                AgentVersion.Product,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return 0;
        }
        catch (Exception ex)
        {
            SupportLog.Record("error", "installer.install-failed", ex);
            MessageBox.Show(
                $"{(isUpdate ? "Update" : "Installation")} failed:\n{ex.Message}",
                AgentVersion.Product,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
    }
}
