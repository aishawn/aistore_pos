namespace Orithos.HardwareConnect;

internal static class DiagnosticGuidance
{
    public static string[] Build(
        string hardwareApi,
        string eftposApi,
        int? printerCount,
        IEnumerable<(string Printer, string Status, string? Detail)> printers,
        string? integrationMode,
        string? adapterListener,
        bool? tokenConfigured,
        bool? tokenRecoveryRequired)
    {
        var actions = new List<string>();

        if (!string.Equals(hardwareApi, "reachable", StringComparison.OrdinalIgnoreCase))
            actions.Add("Hardware service is unavailable. Open the tray diagnostics, then use the installer repair option if it remains unavailable.");

        if (!string.Equals(eftposApi, "reachable", StringComparison.OrdinalIgnoreCase))
            actions.Add("EFTPOS service is unavailable. Open the tray diagnostics and check the local service before taking another payment.");

        if (string.Equals(hardwareApi, "reachable", StringComparison.OrdinalIgnoreCase) && printerCount == 0)
            actions.Add("Windows reports no installed printers. Install or reconnect the receipt printer in Windows, then refresh diagnostics.");

        foreach (var printer in printers)
        {
            if (string.Equals(printer.Status, "attention", StringComparison.OrdinalIgnoreCase))
                actions.Add($"Printer '{printer.Printer}' needs attention{FormatDetail(printer.Detail)}. Check its Windows queue, paper, connection, and cover.");
            else if (string.Equals(printer.Status, "unknown", StringComparison.OrdinalIgnoreCase))
                actions.Add($"Printer '{printer.Printer}' status is unknown{FormatDetail(printer.Detail)}. Check the Windows queue and printer connection.");
        }

        if (tokenRecoveryRequired == true)
            actions.Add("The saved EFTPOS token cannot be read by this Windows profile. Re-enter EFTPOS settings in the Orithos Hardware page.");
        else if (tokenConfigured == false)
            actions.Add("No EFTPOS connector token is configured. Save EFTPOS settings from the Orithos Hardware page.");

        if (string.Equals(integrationMode, "tcp-ip-interface", StringComparison.OrdinalIgnoreCase))
            actions.Add("Linkly PC-EFTPOS TCP is in use (same path as Shopfront without a separate HTTP adapter). Complete an authorized test transaction before live Sell use.");
        else if (string.Equals(integrationMode, "lab", StringComparison.OrdinalIgnoreCase))
            actions.Add("LAB MODE: Linkly was not detected on TCP 2011/2005. Start Linkly EFT-Client or configure ORITHOS_LINKLY_ADAPTER_BASE for HTTP adapter mode.");
        else if (string.Equals(integrationMode, "configuration-error", StringComparison.OrdinalIgnoreCase))
            actions.Add("Linkly adapter configuration is invalid. Correct the local adapter address and refresh diagnostics.");
        else if (string.Equals(integrationMode, "adapter", StringComparison.OrdinalIgnoreCase)
            || string.Equals(integrationMode, "tcp-proxy", StringComparison.OrdinalIgnoreCase))
        {
            if (string.Equals(adapterListener, "unreachable", StringComparison.OrdinalIgnoreCase))
                actions.Add("The configured Linkly adapter port is not accepting local TCP connections. Start the bank's Linkly Client or adapter and verify its address and port. Do not retry a pending or unknown payment.");
            else
                actions.Add("The Linkly adapter TCP listener is reachable, but its protocol, bank connection, and terminal are not verified. Complete the approved store acceptance before live use.");
        }

        if (actions.Count == 0)
            actions.Add("No local service or Windows queue issue was reported. Physical printer sensors, EFTPOS terminal, and bank Linkly connection still require separate verification.");

        return actions.ToArray();
    }

    private static string FormatDetail(string? detail) =>
        string.IsNullOrWhiteSpace(detail) ? string.Empty : $" ({detail})";
}
