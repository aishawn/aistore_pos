using Orithos.HardwareConnect;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class LinklyDiscoveryTests
{
    [Theory]
    [InlineData(1, true, 0, "linkly-client-found")]
    [InlineData(0, true, 0, "linkly-client-found")]
    [InlineData(1, false, 1, "adapter-candidate-found")]
    [InlineData(0, false, 1, "adapter-candidate-found")]
    [InlineData(0, false, 0, "not-found")]
    public void ClassifiesLocalDetectionEvidence(int processCount, bool linklyPortListening, int adapterCount, string expected)
    {
        Assert.Equal(expected, LinklyDiscovery.GetState(processCount, linklyPortListening, adapterCount));
    }
}
