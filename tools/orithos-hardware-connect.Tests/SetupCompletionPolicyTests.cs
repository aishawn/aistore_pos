using Orithos.HardwareConnect;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class SetupCompletionPolicyTests
{
    [Theory]
    [InlineData("https://skr.orithos.com.au/settings/hardware")]
    [InlineData("https://register.example.com/settings/hardware")]
    [InlineData("http://localhost:3100/settings/hardware")]
    [InlineData("http://127.0.0.1:3100/settings/hardware")]
    public void AllowsHttpsAndLoopbackSettingsPages(string value)
    {
        Assert.True(SettingsPagePolicy.TryGetSafeUri(value, out var uri));
        Assert.NotNull(uri);
    }

    [Theory]
    [InlineData("http://register.example.com/settings/hardware")]
    [InlineData("ftp://skr.orithos.com.au/settings/hardware")]
    [InlineData("https://user:password@skr.orithos.com.au/settings/hardware")]
    [InlineData("not a url")]
    [InlineData(null)]
    public void RejectsUnsafeOrInvalidSettingsPages(string? value)
    {
        Assert.False(SettingsPagePolicy.TryGetSafeUri(value, out var uri));
        Assert.Null(uri);
    }

    [Fact]
    public void CompletionPromptDistinguishesServiceReadinessFromDeviceAndPaymentAcceptance()
    {
        var message = SetupCompletionPolicy.SuccessMessage;

        Assert.Contains("local services are responding", message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("physical device", message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("live payment", message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Open Hardware settings now?", message, StringComparison.Ordinal);
    }
}
