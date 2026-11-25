using System.Diagnostics;

namespace Orithos.HardwareConnect;

internal sealed class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon trayIcon;
    private readonly CancellationTokenSource webHostCts = new();
    private Task hardwareWebHostTask;
    private Task linklyWebHostTask;
    private readonly HttpClient healthClient = new() { Timeout = TimeSpan.FromSeconds(2) };
    private readonly ToolStripMenuItem hardwareStatusItem = new("Hardware API: Starting") { Enabled = false };
    private readonly ToolStripMenuItem eftposStatusItem = new("EFTPOS API: Starting") { Enabled = false };
    private readonly System.Windows.Forms.Timer statusTimer = new() { Interval = 3000 };
    private int hardwareHostStarted;
    private int eftposHostStarted;
    private string? hardwareHealth;
    private string? eftposHealth;
    private int healthProbeRunning;
    private int hardwareHealthFailures;
    private int eftposHealthFailures;
    private DateTime nextRestartAllowedUtc = DateTime.MinValue;

    public TrayApplicationContext()
    {
        hardwareWebHostTask = Task.Run(
            () => HardwareConnectWebApp.RunAsync(webHostCts.Token, () => Interlocked.Exchange(ref hardwareHostStarted, 1)),
            webHostCts.Token);
        linklyWebHostTask = Task.Run(
            () => LinklyConnectorWebApp.RunAsync(webHostCts.Token, () => Interlocked.Exchange(ref eftposHostStarted, 1)),
            webHostCts.Token);

        var settingsUrl = Environment.GetEnvironmentVariable("ORITHOS_HC_SETTINGS_URL")
            ?? "https://skr.orithos.com.au/settings/hardware";

        trayIcon = new NotifyIcon
        {
            Icon = BrandAssets.LoadTrayIcon() ?? SystemIcons.Application,
            Visible = true,
            Text = $"{AgentVersion.Product} {AgentVersion.DisplayVersion}",
        };

        var menu = new ContextMenuStrip();
        menu.Items.Add(hardwareStatusItem);
        menu.Items.Add(eftposStatusItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Run local diagnostics…", null, (_, _) =>
        {
            using var diagnostics = new SupportDiagnosticsForm();
            diagnostics.ShowDialog();
        });
        menu.Items.Add("Open Hardware setup and diagnostics", null, (_, _) => OpenUrl(settingsUrl));
        menu.Items.Add("About", null, (_, _) =>
        {
            MessageBox.Show(
                $"{AgentVersion.Product} {AgentVersion.DisplayVersion}\nPrinters: {Environment.GetEnvironmentVariable("ORITHOS_HC_URL") ?? AgentVersion.DefaultListen}\nEFTPOS: {Environment.GetEnvironmentVariable("ORITHOS_CONNECTOR_URL") ?? AgentVersion.DefaultEftposListen}",
                AgentVersion.Product,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        });
        menu.Items.Add(new ToolStripSeparator());
        if (RegisterAgentInstaller.IsRunningFromInstallDir())
        {
            menu.Items.Add("Uninstall…", null, (_, _) => UninstallFromTray());
        }

        menu.Items.Add("Exit", null, (_, _) => Exit());

        trayIcon.ContextMenuStrip = menu;
        trayIcon.DoubleClick += (_, _) => OpenUrl(settingsUrl);
        statusTimer.Tick += (_, _) => RefreshServiceStatus();
        statusTimer.Start();
        RefreshServiceStatus();
    }

    private void RefreshServiceStatus()
    {
        ProbeServices();
        RestartExitedHosts();
        var hardwareStatus = HostTaskStatusText.Describe(hardwareWebHostTask, Volatile.Read(ref hardwareHostStarted) == 1, hardwareHealth);
        var eftposStatus = HostTaskStatusText.Describe(linklyWebHostTask, Volatile.Read(ref eftposHostStarted) == 1, eftposHealth);
        hardwareStatusItem.Text = $"Hardware API: {hardwareStatus}";
        eftposStatusItem.Text = $"EFTPOS API: {eftposStatus}";

        var failed = hardwareStatus.StartsWith("Unavailable", StringComparison.Ordinal)
            || eftposStatus.StartsWith("Unavailable", StringComparison.Ordinal)
            || hardwareWebHostTask.IsFaulted || linklyWebHostTask.IsFaulted;
        trayIcon.Text = failed
            ? $"{AgentVersion.Product}: service error"
            : $"{AgentVersion.Product}: services {hardwareStatus}/{eftposStatus}";
    }

    private void ProbeServices()
    {
        if (Interlocked.Exchange(ref healthProbeRunning, 1) == 1) return;
        _ = Task.Run(async () =>
        {
            try
            {
                var hardwareUrl = Environment.GetEnvironmentVariable("ORITHOS_HC_URL") ?? AgentVersion.DefaultListen;
                var connectorUrl = Environment.GetEnvironmentVariable("ORITHOS_CONNECTOR_URL") ?? AgentVersion.DefaultEftposListen;
                var results = await Task.WhenAll(
                    LocalApiHealthProbe.ProbeAsync(hardwareUrl, healthClient, webHostCts.Token),
                    LocalApiHealthProbe.ProbeAsync(connectorUrl, healthClient, webHostCts.Token));
                Volatile.Write(ref hardwareHealth, results[0]);
                Volatile.Write(ref eftposHealth, results[1]);
            }
            catch (OperationCanceledException) when (webHostCts.IsCancellationRequested)
            {
            }
            catch (ObjectDisposedException) when (webHostCts.IsCancellationRequested)
            {
            }
            finally
            {
                Interlocked.Exchange(ref healthProbeRunning, 0);
            }
        });
    }

    private void RestartExitedHosts()
    {
        var hardwareStarted = Volatile.Read(ref hardwareHostStarted) == 1;
        var eftposStarted = Volatile.Read(ref eftposHostStarted) == 1;
        if (hardwareStarted && !string.Equals(hardwareHealth, "Ready", StringComparison.Ordinal))
            hardwareHealthFailures++;
        else if (string.Equals(hardwareHealth, "Ready", StringComparison.Ordinal))
            hardwareHealthFailures = 0;
        if (eftposStarted && !string.Equals(eftposHealth, "Ready", StringComparison.Ordinal))
            eftposHealthFailures++;
        else if (string.Equals(eftposHealth, "Ready", StringComparison.Ordinal))
            eftposHealthFailures = 0;

        if (!webHostCts.IsCancellationRequested && DateTime.UtcNow >= nextRestartAllowedUtc)
        {
            var restarted = false;
            if (hardwareWebHostTask.IsFaulted || hardwareWebHostTask.IsCompleted || hardwareHealthFailures >= 3)
            {
                hardwareHostStarted = 0;
                hardwareHealth = null;
                hardwareHealthFailures = 0;
                hardwareWebHostTask = Task.Run(
                    () => HardwareConnectWebApp.RunAsync(webHostCts.Token, () => Interlocked.Exchange(ref hardwareHostStarted, 1)),
                    webHostCts.Token);
                restarted = true;
            }
            if (linklyWebHostTask.IsFaulted || linklyWebHostTask.IsCompleted || eftposHealthFailures >= 3)
            {
                eftposHostStarted = 0;
                eftposHealth = null;
                eftposHealthFailures = 0;
                linklyWebHostTask = Task.Run(
                    () => LinklyConnectorWebApp.RunAsync(webHostCts.Token, () => Interlocked.Exchange(ref eftposHostStarted, 1)),
                    webHostCts.Token);
                restarted = true;
            }
            if (restarted) nextRestartAllowedUtc = DateTime.UtcNow.AddSeconds(5);
        }
    }

    private static void OpenUrl(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch
        {
            /* ignore */
        }
    }

    private void UninstallFromTray()
    {
        var confirm = MessageBox.Show(
            "Remove Orithos Hardware Connect from this PC?\n\nReceipt printing and EFTPOS bridge on this register will stop until you install again.",
            AgentVersion.Product,
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning,
            MessageBoxDefaultButton.Button2);
        if (confirm != DialogResult.Yes) return;

        trayIcon.Visible = false;
        RegisterAgentInstaller.RequestUninstallFromTray();
        Application.Exit();
    }

    private void Exit()
    {
        trayIcon.Visible = false;
        trayIcon.Dispose();
        statusTimer.Stop();
        statusTimer.Dispose();
        webHostCts.Cancel();
        try
        {
            Task.WaitAll([hardwareWebHostTask, linklyWebHostTask], TimeSpan.FromSeconds(3));
        }
        catch
        {
            /* ignore */
        }

        webHostCts.Dispose();
        healthClient.Dispose();
        Application.Exit();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            trayIcon.Dispose();
            statusTimer.Dispose();
            webHostCts.Dispose();
            healthClient.Dispose();
        }

        base.Dispose(disposing);
    }
}
