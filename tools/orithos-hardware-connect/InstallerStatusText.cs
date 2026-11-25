namespace Orithos.HardwareConnect;

internal sealed record InstallProgress(string Stage, int Percent);

internal static class InstallerStatusText
{
    public static string ForStage(string stage) => stage switch
    {
        "Preparing" => "Preparing files",
        "StoppingAgent" => "Stopping the running register agent",
        "ReplacingFiles" => "Replacing application files",
        "RegisteringStartup" => "Registering sign-in startup",
        "StartingAgent" => "Starting the register agent",
        "CheckingServices" => "Checking local services",
        _ => "Working",
    };

    public static string ForFailure(Exception exception)
    {
        var failure = FindRelevant(exception);
        return failure switch
        {
            InstallRollbackException rollback =>
                $"Automatic rollback was incomplete. Do not retry. Keep the recovery files and contact Orithos support. Recovery folder: {rollback.RecoveryDirectory}",
            TimeoutException =>
                "The register agent did not stop in time. Close Orithos Hardware Connect from the system tray, then retry the update.",
            UnauthorizedAccessException =>
                "Windows denied access to the current Windows user's install folder. Check folder permissions and run setup again as that same user.",
            _ => "Setup could not finish. Review the error details and contact Orithos support if the problem continues.",
        };
    }

    private static Exception FindRelevant(Exception exception)
    {
        if (exception is InstallRollbackException or TimeoutException or UnauthorizedAccessException)
        {
            return exception;
        }

        if (exception is AggregateException aggregate)
        {
            foreach (var inner in aggregate.Flatten().InnerExceptions)
            {
                var relevant = FindRelevant(inner);
                if (relevant is InstallRollbackException or TimeoutException or UnauthorizedAccessException)
                {
                    return relevant;
                }
            }
        }

        return exception.InnerException is null ? exception : FindRelevant(exception.InnerException);
    }
}
