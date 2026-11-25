using System.Reflection;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class ConnectorRequestValidationTests
{
    [Fact]
    public void RejectsOversizedConfigurationValues()
    {
        Assert.False(InvokeConfig(new string('x', 2_049), "token"));
        Assert.False(InvokeConfig("https://skr.orithos.com.au", new string('x', 16_385)));
        Assert.True(InvokeConfig("https://skr.orithos.com.au", null));
    }

    [Fact]
    public void RejectsInvalidTransactionIdentityFields()
    {
        Assert.False(InvokeTransaction(0, "challenge", "order"));
        Assert.False(InvokeTransaction(7, "", "order"));
        Assert.False(InvokeTransaction(7, new string('x', 8_193), "order"));
        Assert.False(InvokeTransaction(7, "challenge", new string('x', 257)));
        Assert.True(InvokeTransaction(7, "challenge", null));
    }

    private static bool InvokeConfig(string? apiUrl, string? token)
    {
        var type = Assembly.Load("OrithosHardwareConnect").GetType("Orithos.HardwareConnect.ConnectorRequestValidation", true)!;
        var method = type.GetMethod("IsValidConfig", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        return (bool)method.Invoke(null, [apiUrl, token])!;
    }

    private static bool InvokeTransaction(long attemptId, string? challenge, string? orderUuid)
    {
        var assembly = Assembly.Load("OrithosHardwareConnect");
        var type = assembly.GetType("Orithos.HardwareConnect.ConnectorRequestValidation", true)!;
        var fields = type.GetNestedType("ConnectorRequestFields", BindingFlags.NonPublic)!;
        var request = Activator.CreateInstance(fields, [attemptId, challenge, orderUuid]);
        var method = type.GetMethod("IsValidTransaction", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        return (bool)method.Invoke(null, [request])!;
    }
}
