namespace Orithos.HardwareConnect;

internal static class AgentProcessPolicy
{
    public static bool ShouldStop(int processId, string? executablePath, string installedExePath, int currentProcessId)
    {
        if (processId == currentProcessId || string.IsNullOrWhiteSpace(executablePath)) return false;

        try
        {
            return string.Equals(
                Path.GetFullPath(executablePath),
                Path.GetFullPath(installedExePath),
                StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }
}
