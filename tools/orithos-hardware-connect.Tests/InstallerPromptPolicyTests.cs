using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class InstallerPromptPolicyTests
{
    [Fact]
    public void ExistingInstallStartsTheUpdateFlowAutomatically()
    {
        Assert.True(InstallerPromptPolicy.ShouldStartUpdateImmediately(isUpdate: true));
    }

    [Fact]
    public void FirstInstallDoesNotUseTheAutomaticUpdateFlow()
    {
        Assert.False(InstallerPromptPolicy.ShouldStartUpdateImmediately(isUpdate: false));
    }

    [Fact]
    public void FirstInstallConfirmationExplainsStartupAndTrayBehavior()
    {
        Assert.Contains("starts at sign-in", InstallerPromptPolicy.GetFirstInstallConfirmationMessage(), StringComparison.Ordinal);
    }
}
