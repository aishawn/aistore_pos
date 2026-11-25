using System.Reflection;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class InstallVersionPolicyTests
{
    [Fact]
    public void AllowsSameOrNewerInstallerVersions()
    {
        EnsureNotDowngrade(new Version(1, 1, 7), new Version(1, 1, 7));
        EnsureNotDowngrade(new Version(1, 2, 0), new Version(1, 1, 7));
    }

    [Fact]
    public void RejectsOlderInstallerVersionsBeforeReplacement()
    {
        var invocation = Assert.Throws<TargetInvocationException>(() =>
            EnsureNotDowngrade(new Version(1, 1, 6), new Version(1, 1, 7)));

        var error = Assert.IsType<InvalidOperationException>(invocation.InnerException);
        Assert.Contains("older than the installed version", error.Message);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("unknown")]
    public void RefusesToUpgradeWhenInstalledVersionCannotBeVerified(string? fileVersion)
    {
        var invocation = Assert.Throws<TargetInvocationException>(() => ParseInstalledVersion(fileVersion));

        var error = Assert.IsType<InvalidOperationException>(invocation.InnerException);
        Assert.Contains("Could not verify the installed", error.Message);
    }

    private static void EnsureNotDowngrade(Version candidate, Version installed)
    {
        var assembly = Assembly.Load("OrithosHardwareConnect");
        var type = assembly.GetType("Orithos.HardwareConnect.InstallVersionPolicy", throwOnError: true)!;
        var method = type.GetMethod("EnsureNotDowngrade", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        method.Invoke(null, [candidate, installed]);
    }

    private static Version ParseInstalledVersion(string? fileVersion)
    {
        var assembly = Assembly.Load("OrithosHardwareConnect");
        var type = assembly.GetType("Orithos.HardwareConnect.InstallVersionPolicy", throwOnError: true)!;
        var method = type.GetMethod("ParseInstalledVersion", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        return (Version)method.Invoke(null, [fileVersion])!;
    }
}
