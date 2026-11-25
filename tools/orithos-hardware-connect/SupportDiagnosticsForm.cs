using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;

namespace Orithos.HardwareConnect;

internal sealed class SupportDiagnosticsForm : Form
{
    private readonly HttpClient client = new() { Timeout = TimeSpan.FromSeconds(3) };
    private readonly Label statusLabel = new() { AutoSize = true, ForeColor = Color.FromArgb(71, 85, 105) };
    private readonly TextBox reportBox = new()
    {
        Multiline = true,
        ReadOnly = true,
        ScrollBars = ScrollBars.Vertical,
        WordWrap = true,
        BorderStyle = BorderStyle.FixedSingle,
        BackColor = Color.White,
        Dock = DockStyle.Fill,
        Font = new Font("Consolas", 9F),
    };
    private readonly Button refreshButton = new() { Text = "Refresh", AutoSize = true };
    private readonly Button copyButton = new() { Text = "Copy report", AutoSize = true };
    private readonly Button logsButton = new() { Text = "Open logs", AutoSize = true };

    public SupportDiagnosticsForm()
    {
        Text = "Hardware Connect Diagnostics";
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.Sizable;
        MinimumSize = new Size(560, 430);
        Size = new Size(680, 520);
        BackColor = Color.FromArgb(248, 250, 252);
        Font = new Font("Segoe UI", 9F);

        var title = new Label
        {
            Text = "Local device diagnostics",
            Font = new Font("Segoe UI", 15F, FontStyle.Regular),
            ForeColor = Color.FromArgb(15, 23, 42),
            AutoSize = true,
            Margin = new Padding(0, 0, 0, 8),
        };
        var note = new Label
        {
            Text = "API availability does not verify a printer, EFTPOS terminal, bank Linkly connection, or successful payment.",
            AutoSize = false,
            Height = 38,
            Dock = DockStyle.Top,
            ForeColor = Color.FromArgb(120, 53, 15),
        };
        var top = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 1, Padding = new Padding(16, 14, 16, 8) };
        top.Controls.Add(title);
        top.Controls.Add(note);

        var footer = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            AutoSize = true,
            FlowDirection = FlowDirection.LeftToRight,
            Padding = new Padding(12, 8, 12, 10),
        };
        footer.Controls.Add(refreshButton);
        footer.Controls.Add(copyButton);
        footer.Controls.Add(logsButton);
        footer.Controls.Add(statusLabel);

        var body = new Panel { Dock = DockStyle.Fill, Padding = new Padding(16, 4, 16, 10) };
        body.Controls.Add(reportBox);
        Controls.Add(body);
        Controls.Add(footer);
        Controls.Add(top);

        refreshButton.Click += async (_, _) => await RefreshReportAsync();
        copyButton.Click += (_, _) => CopyReport();
        logsButton.Click += (_, _) => OpenLogs();
        Shown += async (_, _) => await RefreshReportAsync();
        FormClosed += (_, _) => client.Dispose();
    }

    private async Task RefreshReportAsync()
    {
        refreshButton.Enabled = false;
        copyButton.Enabled = false;
        statusLabel.Text = "Checking local services…";
        try
        {
            var hardwareUrl = Environment.GetEnvironmentVariable("ORITHOS_HC_URL") ?? AgentVersion.DefaultListen;
            var eftposUrl = Environment.GetEnvironmentVariable("ORITHOS_CONNECTOR_URL") ?? AgentVersion.DefaultEftposListen;
            var hardware = await ReadEndpointAsync(hardwareUrl, "status");
            var printers = await ReadEndpointAsync(hardwareUrl, "printers");
            var printerStatus = await ReadEndpointAsync(hardwareUrl, "printer-status");
            var eftpos = await ReadEndpointAsync(eftposUrl, "status");
            var lines = new List<string>
            {
                $"Product: {AgentVersion.Product}",
                $"Version: {AgentVersion.DisplayVersion}",
                "Support logs: available locally",
                $"Checked: {DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss zzz}",
                "",
                $"Hardware API ({hardwareUrl}): {Describe(hardware)}",
                $"EFTPOS API ({eftposUrl}): {Describe(eftpos)}",
            };

            if (hardware is not null)
            {
                lines.Add($"Hardware service version: {ReadString(hardware.Root, "version") ?? "not reported"}");
                lines.Add($"Windows printers detected: {ReadInt(hardware.Root, "printerCount")?.ToString() ?? "unknown"}");
            }

            lines.Add("");
            lines.Add("Printers");
            var printerNames = ReadArrayStrings(printers?.Root, "printers");
            lines.AddRange(printerNames.Count > 0 ? printerNames.Select(name => $"  - {name}") : [$"  {Describe(printers)}"]);
            var printerObservations = ReadPrinterObservations(printerStatus?.Root);
            if (printerObservations.Count > 0)
            {
                lines.Add("Windows spooler status (does not confirm physical sensors):");
                lines.AddRange(printerObservations.Select(observation =>
                    $"  - {observation.Printer}: {observation.Status}{(string.IsNullOrWhiteSpace(observation.Detail) ? "" : $" ({observation.Detail})")}"));
            }
            else
            {
                lines.Add($"Windows spooler status: {Describe(printerStatus)}");
            }
            lines.Add("");
            lines.Add("EFTPOS configuration");
            lines.Add($"  Mode: {ReadString(eftpos?.Root, "integrationMode") ?? "unknown"}");
            lines.Add($"  Connector: {ReadString(eftpos?.Root, "linklyClient") ?? "unknown"}");
            lines.Add($"  Adapter TCP listener: {ReadString(eftpos?.Root, "adapterListener") ?? "unknown"}");
            lines.Add($"  Terminal: {ReadString(eftpos?.Root, "terminal") ?? "unknown"}");
            lines.Add($"  Connector token configured: {ReadBoolean(eftpos?.Root, "tokenConfigured")?.ToString() ?? "unknown"}");
            lines.Add($"  Connector token recovery required: {ReadBoolean(eftpos?.Root, "tokenRecoveryRequired")?.ToString() ?? "unknown"}");
            var detail = ReadString(eftpos?.Root, "detail");
            if (!string.IsNullOrWhiteSpace(detail)) lines.Add($"  Detail: {detail}");
            lines.Add("  Terminal and bank Linkly state: unverified by local API health checks");

            lines.Add("");
            lines.Add("Recommended actions");
            lines.AddRange(DiagnosticGuidance.Build(
                Describe(hardware),
                Describe(eftpos),
                ReadInt(hardware?.Root ?? default, "printerCount"),
                printerObservations.Select(observation => (observation.Printer, observation.Status, observation.Detail)),
                ReadString(eftpos?.Root, "integrationMode"),
                ReadString(eftpos?.Root, "adapterListener"),
                ReadBoolean(eftpos?.Root, "tokenConfigured"),
                ReadBoolean(eftpos?.Root, "tokenRecoveryRequired"))
                .Select(action => $"  - {action}"));

            reportBox.Text = string.Join(Environment.NewLine, lines);
            statusLabel.Text = "Diagnostic snapshot ready";
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or UriFormatException)
        {
            reportBox.Text = $"{AgentVersion.Product} {AgentVersion.DisplayVersion}{Environment.NewLine}"
                + $"Checked: {DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss zzz}{Environment.NewLine}"
                + $"Diagnostics could not be completed: {ex.GetType().Name}{Environment.NewLine}"
                + "No connector token or payment data is included in this report.";
            statusLabel.Text = "One or more diagnostic requests failed";
        }
        finally
        {
            refreshButton.Enabled = true;
            copyButton.Enabled = true;
            logsButton.Enabled = true;
        }
    }

    private async Task<EndpointResponse?> ReadEndpointAsync(string baseUrl, string path)
    {
        if (!LocalRequestSecurity.IsLoopbackListenUrl(baseUrl))
            return new EndpointResponse(0, default, "configured URL is not loopback; request was not sent");

        try
        {
            if (await LocalApiHealthProbe.ProbeAsync(baseUrl, client, CancellationToken.None) != "Ready") return null;
            using var response = await client.GetAsync(new Uri(new Uri(baseUrl), $"v1/{path}"));
            var payload = await response.Content.ReadAsStringAsync();
            using var document = JsonDocument.Parse(payload);
            return new EndpointResponse((int)response.StatusCode, document.RootElement.Clone());
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or UriFormatException)
        {
            return null;
        }
    }

    private static string Describe(EndpointResponse? endpoint) => endpoint is null
        ? "unavailable or invalid response"
        : endpoint.Error is not null
            ? endpoint.Error
        : endpoint.StatusCode is >= 200 and < 300
            ? "reachable"
            : $"HTTP {endpoint.StatusCode}";

    private static string? ReadString(JsonElement? root, string name) =>
        root is { ValueKind: JsonValueKind.Object } value
        && value.TryGetProperty(name, out var property)
        && property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;

    private static int? ReadInt(JsonElement root, string name) =>
        root.ValueKind == JsonValueKind.Object
        && root.TryGetProperty(name, out var property)
        && property.TryGetInt32(out var value)
            ? value
            : null;

    private static bool? ReadBoolean(JsonElement? root, string name) =>
        root is { ValueKind: JsonValueKind.Object } value
        && value.TryGetProperty(name, out var property)
        && property.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? property.GetBoolean()
            : null;

    private static List<string> ReadArrayStrings(JsonElement? root, string name)
    {
        var result = new List<string>();
        if (root is not { ValueKind: JsonValueKind.Object } value
            || !value.TryGetProperty(name, out var array)
            || array.ValueKind != JsonValueKind.Array) return result;

        foreach (var item in array.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(item.GetString()))
                result.Add(item.GetString()!);
        }

        return result;
    }

    private static List<PrinterObservation> ReadPrinterObservations(JsonElement? root)
    {
        var result = new List<PrinterObservation>();
        if (root is not { ValueKind: JsonValueKind.Object } value
            || !value.TryGetProperty("printers", out var array)
            || array.ValueKind != JsonValueKind.Array) return result;

        foreach (var item in array.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) continue;
            var printer = ReadString(item, "printer");
            var status = ReadString(item, "status");
            var detail = ReadString(item, "detail");
            if (!string.IsNullOrWhiteSpace(printer) && !string.IsNullOrWhiteSpace(status))
                result.Add(new PrinterObservation(printer, status, detail));
        }

        return result;
    }

    private static string? ReadString(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(name, out var property)
        && property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;

    private void CopyReport()
    {
        if (string.IsNullOrWhiteSpace(reportBox.Text)) return;
        Clipboard.SetText(reportBox.Text);
        statusLabel.Text = "Report copied without connector token or payment data";
    }

    private void OpenLogs()
    {
        try
        {
            SupportLog.Initialize();
            var start = new ProcessStartInfo("explorer.exe") { UseShellExecute = true };
            start.ArgumentList.Add(SupportLog.LogDirectoryPath);
            Process.Start(start);
            statusLabel.Text = "Opened support log folder";
        }
        catch
        {
            statusLabel.Text = "Could not open support log folder";
        }
    }

    private sealed record PrinterObservation(string Printer, string Status, string? Detail);
    private sealed record EndpointResponse(int StatusCode, JsonElement Root, string? Error = null);
}
