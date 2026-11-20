using System.Diagnostics;

namespace Orithos.HardwareConnect;

internal sealed class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon trayIcon;
    private readonly CancellationTokenSource webHostCts = new();
    private readonly Task hardwareWebHostTask;
    private readonly Task linklyWebHostTask;

    public TrayApplicationContext()
    {
        hardwareWebHostTask = Task.Run(() => HardwareConnectWebApp.RunAsync(webHostCts.Token), webHostCts.Token);
        linklyWebHostTask = Task.Run(() => LinklyConnectorWebApp.RunAsync(webHostCts.Token), webHostCts.Token);

        var settingsUrl = Environment.GetEnvironmentVariable("ORITHOS_HC_SETTINGS_URL")
            ?? "https://skr.orithos.com.au/settings/hardware";

        trayIcon = new NotifyIcon
        {
            Icon = BrandAssets.LoadTrayIcon() ?? SystemIcons.Application,
            Visible = true,
            Text = $"{AgentVersion.Product} {AgentVersion.DisplayVersion}",
        };

        var menu = new ContextMenuStrip();
        menu.Items.Add("Open Hardware settings", null, (_, _) => OpenUrl(settingsUrl));
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
        Application.Exit();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            trayIcon.Dispose();
            webHostCts.Dispose();
        }

        base.Dispose(disposing);
    }
}