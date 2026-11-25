using System.Reflection;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class InstallerPromptPolicyTests
{
    [Fact]
    public void UpdatePromptWarnsAboutPendingAndUnknownEftposOutcomes()
    {
        var message = GetConfirmationMessage(isUpdate: true);

        Assert.Contains("close active checkout work", message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("pending or unknown", message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("terminal and Linkly journal", message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Existing settings and exported data are preserved", message, StringComparison.Ordinal);
    }

    [Fact]
    public void FirstInstallPromptDoesNotClaimItWillStopAnExistingAgent()
    {
        var message = GetConfirmationMessage(isUpdate: false);

        Assert.Contains("starts at sign-in", message, StringComparison.Ordinal);
        Assert.DoesNotContain("pending or unknown", message, StringComparison.OrdinalIgnoreCase);
    }

    private static string GetConfirmationMessage(bool isUpdate)
    {
        var type = Assembly.Load("OrithosHardwareConnect").GetType("Orithos.HardwareConnect.InstallerPromptPolicy", throwOnError: true)!;
        var method = type.GetMethod("GetConfirmationMessage", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        return (string)method.Invoke(null, [isUpdate])!;
    }
}
