namespace Orithos.HardwareConnect;

internal static class InstallVersionPolicy
{
    public static void EnsureNotDowngrade(Version candidate, Version installed)
    {
        if (candidate < installed)
        {
            throw new InvalidOperationException(
                $"Version {candidate} is older than the installed version {installed}. Close this setup and use the latest installer.");
        }
    }

    public static Version ParseInstalledVersion(string? fileVersion)
    {
        if (!Version.TryParse(fileVersion, out var installed))
        {
            throw new InvalidOperationException(
                "Could not verify the installed Hardware Connect version. Repair or uninstall the existing installation before continuing.");
        }

        return installed;
    }
}
