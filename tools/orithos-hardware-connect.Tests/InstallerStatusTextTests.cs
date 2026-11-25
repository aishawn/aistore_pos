using System.Reflection;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class InstallerStatusTextTests
{
    [Theory]
    [InlineData("Preparing", "Preparing files")]
    [InlineData("StoppingAgent", "Stopping the running register agent")]
    [InlineData("ReplacingFiles", "Replacing application files")]
    [InlineData("RegisteringStartup", "Registering sign-in startup")]
    [InlineData("StartingAgent", "Starting the register agent")]
    public void DescribesInstallStagesWithOperatorFacingText(string stage, string expected)
    {
        Assert.Equal(expected, Invoke("ForStage", stage));
    }

    [Fact]
    public void IncompleteRollbackShowsRecoveryLocationAndStopsRetryGuidance()
    {
        var exceptionType = Assembly.Load("OrithosHardwareConnect")
            .GetType("Orithos.HardwareConnect.InstallRollbackException", throwOnError: true)!;
        var exception = (Exception)Activator.CreateInstance(exceptionType,
            @"C:\Users\operator\AppData\Local\Orithos\.HardwareConnect-update-123",
            new IOException("replacement failed"),
            new[] { new IOException("restore failed") })!;

        var guidance = Invoke("ForFailure", exception);

        Assert.Contains("automatic rollback was incomplete", guidance, StringComparison.OrdinalIgnoreCase);
        Assert.Contains(@"C:\Users\operator\AppData\Local\Orithos\.HardwareConnect-update-123", guidance);
        Assert.Contains("contact Orithos support", guidance, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Do not retry", guidance, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void StopTimeoutAsksOperatorToCloseTheAgentAndRetry()
    {
        var guidance = Invoke("ForFailure", new TimeoutException("agent did not exit"));

        Assert.Contains("close Orithos Hardware Connect", guidance, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("retry", guidance, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void AccessDeniedExplainsCurrentUserInstallScope()
    {
        var guidance = Invoke("ForFailure", new UnauthorizedAccessException());

        Assert.Contains("current Windows user", guidance, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("folder permissions", guidance, StringComparison.OrdinalIgnoreCase);
    }

    private static string Invoke(string methodName, params object[] arguments)
    {
        var assembly = Assembly.Load("OrithosHardwareConnect");
        var type = assembly.GetType("Orithos.HardwareConnect.InstallerStatusText", throwOnError: true)!;
        var method = type.GetMethod(methodName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        return (string)method.Invoke(null, arguments)!;
    }
}
