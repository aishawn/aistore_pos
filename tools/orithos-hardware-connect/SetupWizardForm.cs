using System.Drawing;

namespace Orithos.HardwareConnect;

internal sealed class SetupWizardForm : Form
{
    private readonly string? settingsUrl;
    private readonly ProgressBar progress;
    private readonly Label progressCaption;
    private readonly Label statusLabel;
    private readonly Button installButton;
    private readonly Button closeButton;

    public SetupWizardForm(string? settingsUrl)
    {
        this.settingsUrl = settingsUrl;
        Text = $"{AgentVersion.Product} Setup";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(520, 280);
        BackColor = Color.White;
        Font = new Font("Segoe UI", 9F);

        var logo = BrandAssets.LoadLogoImage();
        using var formIcon = BrandAssets.LoadApplicationIcon();
        if (formIcon is not null)
        {
            Icon = (Icon)formIcon.Clone();
        }

        var header = new Panel
        {
            Dock = DockStyle.Top,
            Height = 88,
            BackColor = Color.White,
            Padding = new Padding(16, 16, 16, 8),
        };

        if (logo is not null)
        {
            header.Controls.Add(new PictureBox
            {
                Image = logo,
                SizeMode = PictureBoxSizeMode.Zoom,
                Size = new Size(56, 56),
                Location = new Point(0, 4),
            });
        }

        header.Controls.Add(new Label
        {
            Text = AgentVersion.Product,
            Font = new Font("Segoe UI", 16F, FontStyle.Regular),
            ForeColor = Color.FromArgb(15, 23, 42),
            AutoSize = true,
            Location = new Point(72, 8),
        });
        header.Controls.Add(new Label
        {
            Text = $"Version {AgentVersion.DisplayVersion}",
            ForeColor = Color.FromArgb(100, 116, 139),
            AutoSize = true,
            Location = new Point(74, 40),
        });
        header.Controls.Add(new Label
        {
            Text = "Printers · cash drawer · local EFTPOS bridge",
            ForeColor = Color.FromArgb(71, 85, 105),
            AutoSize = true,
            Location = new Point(74, 60),
        });

        statusLabel = new Label
        {
            Text = RegisterAgentInstaller.IsInstalled()
                ? "A register agent is already installed. Choose Upgrade to replace it and keep this PC's settings and exported data."
                : "Choose Install to set up the register agent on this PC and start it at sign-in.",
            Location = new Point(24, 108),
            Size = new Size(472, 44),
            ForeColor = Color.FromArgb(51, 65, 85),
        };

        progressCaption = new Label
        {
            Text = "Setup Progress",
            Font = new Font("Segoe UI", 11F, FontStyle.Regular),
            ForeColor = Color.FromArgb(51, 65, 85),
            AutoSize = true,
            Location = new Point(24, 152),
            Visible = false,
        };

        progress = new ProgressBar
        {
            Location = new Point(24, 178),
            Size = new Size(472, 18),
            Style = ProgressBarStyle.Continuous,
            Minimum = 0,
            Maximum = 100,
            Visible = false,
        };

        installButton = new Button
        {
            Text = RegisterAgentInstaller.IsInstalled() ? "Upgrade" : "Install",
            Location = new Point(312, 208),
            Size = new Size(100, 32),
            FlatStyle = FlatStyle.System,
        };
        installButton.Click += (_, _) => BeginInstall();

        closeButton = new Button
        {
            Text = "Close",
            DialogResult = DialogResult.Cancel,
            Location = new Point(420, 208),
            Size = new Size(76, 32),
            FlatStyle = FlatStyle.System,
        };

        Controls.Add(closeButton);
        Controls.Add(installButton);
        Controls.Add(progressCaption);
        Controls.Add(progress);
        Controls.Add(statusLabel);
        Controls.Add(header);
        CancelButton = closeButton;
        AcceptButton = installButton;
    }

    private async void BeginInstall()
    {
        installButton.Enabled = false;
        closeButton.Enabled = false;
        progress.Visible = true;
        progress.Value = 0;
        statusLabel.Text = InstallerStatusText.ForStage("Preparing");
        progressCaption.Visible = true;
        var filesInstalled = false;
        var installerProgress = new Progress<InstallProgress>(step =>
        {
            statusLabel.Text = InstallerStatusText.ForStage(step.Stage);
            progress.Value = Math.Clamp(step.Percent, progress.Minimum, progress.Maximum);
        });

        try
        {
            await Task.Run(() => RegisterAgentInstaller.Install(settingsUrl, installerProgress));
            filesInstalled = true;
            statusLabel.Text = InstallerStatusText.ForStage("StartingAgent");
            progress.Value = 92;
            RegisterAgentInstaller.LaunchInstalledAgent();
            statusLabel.Text = InstallerStatusText.ForStage("CheckingServices");
            var servicesReady = await Task.Run(() => RegisterAgentInstaller.WaitForLocalServicesReady(TimeSpan.FromSeconds(20)));
            if (!servicesReady)
            {
                throw new InvalidOperationException("Hardware Connect started, but one or both local services did not become ready within 20 seconds.");
            }

            progress.Value = 100;
            progress.Visible = false;
            statusLabel.Text = "Installation complete. Hardware Connect is starting in the system tray.";
            SupportLog.Record("info", "installer.install-verified");
            MessageBox.Show(
                "Installation complete.\n\nOpen Hardware settings to confirm both local services are online and connect your devices. If Windows Firewall asks, allow Orithos Hardware Connect on private networks.",
                AgentVersion.Product,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            DialogResult = DialogResult.OK;
            Close();
        }
        catch (Exception ex)
        {
            SupportLog.Record("error", "installer.install-failed", ex);
            progress.Visible = false;
            installButton.Enabled = true;
            closeButton.Enabled = true;
            statusLabel.Text = filesInstalled
                ? "Files installed, but Hardware Connect services could not be confirmed ready."
                : "Installation could not be completed.";
            MessageBox.Show(
                $"{statusLabel.Text}\n\n{InstallerStatusText.ForFailure(ex)}\n\nDetails: {ex.Message}",
                AgentVersion.Product,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }
}
