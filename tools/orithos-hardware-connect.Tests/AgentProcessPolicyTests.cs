using System.Reflection;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class AgentProcessPolicyTests
{
    [Fact]
    public void StopsOnlyOtherProcessesRunningFromTheInstalledExecutable()
    {
        var installDirectory = Path.Combine(Path.GetTempPath(), "Orithos", "HardwareConnect");
        var installedExe = Path.Combine(installDirectory, "OrithosHardwareConnect.exe");

        Assert.True(ShouldStop(123, installedExe, installedExe, 456));
        Assert.False(ShouldStop(456, installedExe, installedExe, 456));
        Assert.False(ShouldStop(123, Path.Combine(Path.GetTempPath(), "OrithosHardwareConnect-Setup.exe"), installedExe, 456));
        Assert.False(ShouldStop(123, null, installedExe, 456));
    }

    [Fact]
    public void MatchesInstalledExecutablePathWithoutCaseSensitivity()
    {
        var installDirectory = Path.Combine(Path.GetTempPath(), "Orithos", "HardwareConnect");
        var installedExe = Path.Combine(installDirectory, "OrithosHardwareConnect.exe");

        Assert.True(ShouldStop(123, installedExe.ToUpperInvariant(), installedExe, 456));
    }

    private static bool ShouldStop(int processId, string? executablePath, string installedExePath, int currentProcessId)
    {
        var assembly = Assembly.Load("OrithosHardwareConnect");
        var type = assembly.GetType("Orithos.HardwareConnect.AgentProcessPolicy", throwOnError: true)!;
        var method = type.GetMethod("ShouldStop", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        return (bool)method.Invoke(null, [processId, executablePath, installedExePath, currentProcessId])!;
    }
}
