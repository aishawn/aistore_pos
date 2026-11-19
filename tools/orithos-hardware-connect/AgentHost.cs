namespace Orithos.HardwareConnect;

internal static class AgentHost
{
    private const string SingleInstanceMutexName = @"Local\OrithosHardwareConnect";

    public static void Run(string[] args)
    {
        if (args.Contains("--uninstall", StringComparer.OrdinalIgnoreCase))
        {
            RegisterAgentInstaller.Uninstall();
            MessageBox.Show(
                $"{AgentVersion.Product} has been removed from this PC.",
                AgentVersion.Product,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        var settingsUrlArg = args.FirstOrDefault(a => a.StartsWith("--settings-url=", StringComparison.OrdinalIgnoreCase));
        var settingsUrl = settingsUrlArg is null ? null : settingsUrlArg[(settingsUrlArg.IndexOf('=') + 1)..];

        if (args.Contains("--install", StringComparer.OrdinalIgnoreCase))
        {
            RunInstallFlow(settingsUrl, silent: false);
            return;
        }

        if (!RegisterAgentInstaller.IsRunningFromInstallDir())
        {
            if (!RegisterAgentInstaller.IsInstalled())
            {
                RunInstallFlow(settingsUrl, silent: false);
                return;
            }

            RegisterAgentInstaller.LaunchInstalledAgent();
            return;
        }

        var consoleMode = args.Contains("--console", StringComparer.OrdinalIgnoreCase)
            || string.Equals(Environment.GetEnvironmentVariable("ORITHOS_HC_CONSOLE"), "1", StringComparison.Ordinal);

        using var mutex = new Mutex(true, SingleInstanceMutexName, out var createdNew);
        if (!createdNew)
        {
            MessageBox.Show(
                $"{AgentVersion.Product} is already running on this register.",
                AgentVersion.Product,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        if (consoleMode)
        {
            var hcUrl = Environment.GetEnvironmentVariable("ORITHOS_HC_URL") ?? AgentVersion.DefaultListen;
            var eftposUrl = Environment.GetEnvironmentVariable("ORITHOS_CONNECTOR_URL") ?? AgentVersion.DefaultEftposListen;
            Console.WriteLine($"{AgentVersion.Product} {AgentVersion.DisplayVersion}");
            Console.WriteLine($"Printers: {hcUrl}");
            Console.WriteLine($"EFTPOS:   {eftposUrl}");
            Task.WhenAll(
                HardwareConnectWebApp.RunAsync(CancellationToken.None),
                LinklyConnectorWebApp.RunAsync(CancellationToken.None)).GetAwaiter().GetResult();
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new TrayApplicationContext());
    }

    private static void RunInstallFlow(string? settingsUrl, bool silent)
    {
        if (!silent)
        {
            var confirm = MessageBox.Show(
                $"{AgentVersion.Product} installs on this register PC, starts at sign-in, and shows a tray icon.\n\nChoose Yes to install now.",
                $"Install {AgentVersion.Product}",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);
            if (confirm != DialogResult.Yes)
            {
                return;
            }
        }

        try
        {
            RegisterAgentInstaller.Install(settingsUrl);
            MessageBox.Show(
                "Installation complete. The register agent is starting now.\n\nIf Windows Firewall asks, allow access on private networks.",
                AgentVersion.Product,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            RegisterAgentInstaller.LaunchInstalledAgent();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Installation failed:\n{ex.Message}",
                AgentVersion.Product,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }
}