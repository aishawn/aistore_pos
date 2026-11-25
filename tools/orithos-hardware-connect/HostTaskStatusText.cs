namespace Orithos.HardwareConnect;

internal static class HostTaskStatusText
{
    public static string Describe(Task hostTask, bool hostStarted, string? healthResult = null)
    {
        if (hostTask.IsFaulted)
        {
            var exceptionType = hostTask.Exception?.GetBaseException().GetType().Name ?? "Exception";
            return $"Failed ({exceptionType})";
        }

        if (hostTask.IsCanceled || hostTask.IsCompleted)
        {
            return "Stopped";
        }

        if (!hostStarted) return "Starting";
        return string.IsNullOrWhiteSpace(healthResult) ? "Running" : healthResult;
    }
}
