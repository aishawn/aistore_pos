using System.Reflection;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class RawPrinterResultPolicyTests
{
    [Fact]
    public void ReportsSuccessOnlyWhenAllBytesAndSpoolerDocumentComplete()
    {
        Assert.True(IsSuccessful(true, true, 64, 64, true, true));
    }

    [Theory]
    [InlineData(false, true, 64, 64, true, true)]
    [InlineData(true, false, 64, 64, true, true)]
    [InlineData(true, true, 64, 63, true, true)]
    [InlineData(true, true, 64, 64, false, true)]
    [InlineData(true, true, 64, 64, true, false)]
    [InlineData(true, true, 0, 0, true, true)]
    public void ReportsFailureWhenAnyPrintStageIsIncomplete(
        bool pageStarted,
        bool writeSucceeded,
        int requestedBytes,
        int writtenBytes,
        bool pageEnded,
        bool documentEnded)
    {
        Assert.False(IsSuccessful(pageStarted, writeSucceeded, requestedBytes, writtenBytes, pageEnded, documentEnded));
    }

    private static bool IsSuccessful(bool pageStarted, bool writeSucceeded, int requestedBytes, int writtenBytes, bool pageEnded, bool documentEnded)
    {
        var type = Assembly.Load("OrithosHardwareConnect").GetType("Orithos.HardwareConnect.RawPrinterResultPolicy", throwOnError: true)!;
        var method = type.GetMethod("IsSuccessful", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        return (bool)method.Invoke(null, [pageStarted, writeSucceeded, requestedBytes, writtenBytes, pageEnded, documentEnded])!;
    }
}
