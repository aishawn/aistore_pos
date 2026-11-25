using System.Reflection;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class HostTaskStatusTextTests
{
    [Theory]
    [InlineData(false, "Starting")]
    [InlineData(true, "Running")]
    public void DescribesStartingAndRunningHosts(bool started, string expected)
    {
        Assert.Equal(expected, Describe(Task.Delay(Timeout.Infinite), started));
    }

    [Theory]
    [InlineData("Ready", "Ready")]
    [InlineData("Unavailable", "Unavailable")]
    [InlineData("Unavailable (HTTP 503)", "Unavailable (HTTP 503)")]
    public void UsesHttpHealthResultAfterHostStarts(string healthResult, string expected)
    {
        Assert.Equal(expected, Describe(Task.Delay(Timeout.Infinite), started: true, healthResult));
    }

    [Fact]
    public void DescribesCompletedHostAsStopped()
    {
        Assert.Equal("Stopped", Describe(Task.CompletedTask, started: true));
    }

    [Fact]
    public void ReportsFailureTypeWithoutExposingExceptionMessage()
    {
        var task = Task.FromException(new InvalidOperationException("sensitive local path"));

        Assert.Equal("Failed (InvalidOperationException)", Describe(task, started: false));
        Assert.True(task.Exception is not null);
        Assert.DoesNotContain("sensitive local path", Describe(task, started: false));
    }

    private static string Describe(Task task, bool started)
        => Describe(task, started, null);

    private static string Describe(Task task, bool started, string? healthResult)
    {
        var assembly = Assembly.Load("OrithosHardwareConnect");
        var type = assembly.GetType("Orithos.HardwareConnect.HostTaskStatusText", throwOnError: true)!;
        var describe = type.GetMethod("Describe", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static,
            binder: null, [typeof(Task), typeof(bool), typeof(string)], modifiers: null)!;
        return (string)describe.Invoke(null, [task, started, healthResult])!;
    }
}
