namespace Orithos.HardwareConnect;

internal static class HostRestartPolicy
{
    private static readonly TimeSpan InitialDelay = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan MaximumDelay = TimeSpan.FromMinutes(5);

    public static TimeSpan DelayForAttempt(int attempt)
    {
        if (attempt <= 1) return InitialDelay;
        var seconds = InitialDelay.TotalSeconds * Math.Pow(2, Math.Min(attempt - 1, 6));
        return TimeSpan.FromSeconds(Math.Min(seconds, MaximumDelay.TotalSeconds));
    }
}
