namespace Orithos.HardwareConnect;

internal static class InstallerPromptPolicy
{
    public static bool ShouldStartUpdateImmediately(bool isUpdate) => isUpdate;

    public static string GetFirstInstallConfirmationMessage() =>
        $"{AgentVersion.Product} installs on this register PC, starts at sign-in, and shows a tray icon.\n\nChoose Yes to install now.";
}
