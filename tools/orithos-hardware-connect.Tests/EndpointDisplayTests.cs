using Orithos.HardwareConnect;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class EndpointDisplayTests
{
    [Theory]
    [InlineData("http://127.0.0.1:9170/private/path?token=secret", "127.0.0.1:9170")]
    [InlineData("http://localhost:9167/connector?key=secret", "localhost:9167")]
    [InlineData("http://[::1]:9170/status?token=secret", "[::1]:9170")]
    public void SafeLabelOmitsPathAndQuery(string configuredUrl, string expected)
    {
        var label = EndpointDisplay.SafeLabel(configuredUrl);

        Assert.Equal(expected, label);
        Assert.DoesNotContain("secret", label);
        Assert.DoesNotContain("/", label);
        Assert.DoesNotContain("?", label);
    }

    [Theory]
    [InlineData("https://user:secret@example.com:9170/path?token=private")]
    [InlineData("not a url")]
    public void SafeLabelHidesNonLoopbackOrInvalidUrls(string configuredUrl)
    {
        var label = EndpointDisplay.SafeLabel(configuredUrl);

        Assert.Equal("hidden (non-loopback or invalid URL)", label);
        Assert.DoesNotContain("secret", label);
        Assert.DoesNotContain("private", label);
    }
}
