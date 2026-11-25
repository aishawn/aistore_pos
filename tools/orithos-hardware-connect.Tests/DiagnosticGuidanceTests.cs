using System.Reflection;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class DiagnosticGuidanceTests
{
    [Fact]
    public void CallsOutLabModeAsNotSuitableForLivePayments()
    {
        var actions = Build("reachable", "reachable", 1, [], "lab", "not-configured", true, false);

        Assert.Contains(actions, action => action.Contains("LAB MODE", StringComparison.Ordinal));
        Assert.Contains(actions, action => action.Contains("cannot process live card payments", StringComparison.Ordinal));
    }

    [Fact]
    public void GivesPrinterAndCredentialRecoverySteps()
    {
        var printer = ("Receipt", "attention", (string?)"paper out");
        var actions = Build("reachable", "reachable", 1, [printer], "tcp-proxy", "reachable", false, true);

        Assert.Contains(actions, action => action.Contains("Receipt", StringComparison.Ordinal) && action.Contains("paper out", StringComparison.Ordinal));
        Assert.Contains(actions, action => action.Contains("Re-enter EFTPOS settings", StringComparison.Ordinal));
        Assert.Contains(actions, action => action.Contains("not verified", StringComparison.Ordinal));
    }

    [Fact]
    public void ExplainsMissingPrinterAndUnavailableServices()
    {
        var actions = Build("unavailable or invalid response", "unavailable or invalid response", null, [], null, null, null, null);

        Assert.Contains(actions, action => action.Contains("Hardware service is unavailable", StringComparison.Ordinal));
        Assert.Contains(actions, action => action.Contains("EFTPOS service is unavailable", StringComparison.Ordinal));

        var noPrinters = Build("reachable", "reachable", 0, [], null, null, true, false);
        Assert.Contains(noPrinters, action => action.Contains("no installed printers", StringComparison.Ordinal));
    }

    [Fact]
    public void GuidesOperatorWhenAdapterListenerIsDown()
    {
        var actions = Build("reachable", "reachable", 1, [], "tcp-proxy", "unreachable", true, false);

        Assert.Contains(actions, action => action.Contains("not accepting local TCP connections", StringComparison.Ordinal));
        Assert.Contains(actions, action => action.Contains("Do not retry", StringComparison.Ordinal));
    }

    private static string[] Build(string hardwareApi, string eftposApi, int? printerCount,
        IEnumerable<(string Printer, string Status, string? Detail)> printers, string? mode, string? adapterListener,
        bool? tokenConfigured, bool? recoveryRequired)
    {
        var type = Assembly.Load("OrithosHardwareConnect").GetType("Orithos.HardwareConnect.DiagnosticGuidance", throwOnError: true)!;
        var method = type.GetMethod("Build", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        return (string[])method.Invoke(null, [hardwareApi, eftposApi, printerCount, printers, mode, adapterListener, tokenConfigured, recoveryRequired])!;
    }
}
