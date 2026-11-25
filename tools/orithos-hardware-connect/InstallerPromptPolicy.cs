namespace Orithos.HardwareConnect;

internal static class InstallerPromptPolicy
{
    public static string GetConfirmationMessage(bool isUpdate) => isUpdate
        ? $"{AgentVersion.Product} will stop and replace the running register agent. Existing settings and exported data are preserved.\n\nBefore updating, close active checkout work and confirm every EFTPOS attempt has a known final result. Do not update while a payment is pending or unknown; reconcile it with the terminal and Linkly journal first.\n\nChoose Yes to update now."
        : $"{AgentVersion.Product} installs on this register PC, starts at sign-in, and shows a tray icon.\n\nChoose Yes to install now.";
}
