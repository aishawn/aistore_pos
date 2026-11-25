using System.Reflection;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class HostRestartPolicyTests
{
    [Theory]
    [InlineData(0, 5)]
    [InlineData(1, 5)]
    [InlineData(2, 10)]
    [InlineData(3, 20)]
    [InlineData(4, 40)]
    [InlineData(7, 300)]
    [InlineData(20, 300)]
    public void UsesBoundedExponentialRestartDelay(int attempt, double expectedSeconds)
    {
        var assembly = Assembly.Load("OrithosHardwareConnect");
        var type = assembly.GetType("Orithos.HardwareConnect.HostRestartPolicy", throwOnError: true)!;
        var method = type.GetMethod("DelayForAttempt", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;

        var delay = (TimeSpan)method.Invoke(null, [attempt])!;

        Assert.Equal(TimeSpan.FromSeconds(expectedSeconds), delay);
    }
}
