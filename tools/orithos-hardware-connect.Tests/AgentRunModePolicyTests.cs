using System.Reflection;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class AgentRunModePolicyTests
{
    [Theory]
    [InlineData("--console", null, true)]
    [InlineData("--CONSOLE", null, true)]
    [InlineData("--other", "1", true)]
    [InlineData("--other", "true", false)]
    [InlineData("--other", null, false)]
    public void RecognizesConsoleModeFromArgumentOrExplicitEnvironmentFlag(string argument, string? environment, bool expected)
    {
        var type = Assembly.Load("OrithosHardwareConnect").GetType("Orithos.HardwareConnect.AgentRunModePolicy", throwOnError: true)!;
        var method = type.GetMethod("IsConsoleMode", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;

        var actual = (bool)method.Invoke(null, [new[] { argument }, environment])!;

        Assert.Equal(expected, actual);
    }
}
