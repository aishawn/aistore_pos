namespace Orithos.HardwareConnect;

internal static class AgentHost
{
    private const string SingleInstanceMutexName = @"Local\OrithosHardwareConnect";

    public static void Run(string[] args)
    {
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
            Console.WriteLine($"{AgentVersion.Product} {AgentVersion.DisplayVersion} listening on {Environment.GetEnvironmentVariable("ORITHOS_HC_URL") ?? AgentVersion.DefaultListen}");
            HardwareConnectWebApp.RunAsync(CancellationToken.None).GetAwaiter().GetResult();
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new TrayApplicationContext());
    }
}