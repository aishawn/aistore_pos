using System.Reflection;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class PrinterQueueStatusTests
{
    [Theory]
    [InlineData(0x00000010, "attention")]
    [InlineData(0x00000080, "attention")]
    [InlineData(0x00000400, "clear")]
    [InlineData(0x02000000, "unknown")]
    public void ClassifiesWindowsSpoolerFlagsWithoutTreatingUnknownFlagsAsClear(int flags, string expected)
    {
        var type = Assembly.Load("OrithosHardwareConnect").GetType("Orithos.HardwareConnect.PrinterQueueStatus", throwOnError: true)!;
        var method = type.GetMethod("Classify", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;

        var actual = (string)method.Invoke(null, [flags])!;

        Assert.Equal(expected, actual);
    }

    [Fact]
    public void DescribesKnownPaperAndDeviceConditions()
    {
        var type = Assembly.Load("OrithosHardwareConnect").GetType("Orithos.HardwareConnect.PrinterQueueStatus", throwOnError: true)!;
        var method = type.GetMethod("DescribeFlags", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;

        var actual = (string[])method.Invoke(null, [0x00000010 | 0x00000080])!;

        Assert.Contains("paper out", actual);
        Assert.Contains("offline", actual);
    }
}
