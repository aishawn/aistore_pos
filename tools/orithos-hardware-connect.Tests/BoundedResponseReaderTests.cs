using System.Text;
using Orithos.HardwareConnect;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class BoundedResponseReaderTests
{
    [Fact]
    public async Task ReadsJsonWithinTheConfiguredLimit()
    {
        const string json = "{\"status\":\"APPROVED\"}";
        await using var stream = new MemoryStream(Encoding.UTF8.GetBytes(json));

        var result = await BoundedResponseReader.ReadAsync(stream, stream.Length, CancellationToken.None, 64);

        Assert.Equal(json, result);
    }

    [Fact]
    public async Task RejectsDeclaredContentLengthAboveLimitBeforeReading()
    {
        await using var stream = new ThrowOnReadStream();

        await Assert.ThrowsAsync<InvalidDataException>(() =>
            BoundedResponseReader.ReadAsync(stream, 65, CancellationToken.None, 64));
    }

    [Fact]
    public async Task RejectsChunkedOrIncorrectlyDeclaredBodyAboveLimit()
    {
        await using var stream = new MemoryStream(Encoding.UTF8.GetBytes(new string('x', 65)));

        await Assert.ThrowsAsync<InvalidDataException>(() =>
            BoundedResponseReader.ReadAsync(stream, null, CancellationToken.None, 64));
    }

    private sealed class ThrowOnReadStream : MemoryStream
    {
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) =>
            throw new Xunit.Sdk.XunitException("The reader should reject the declared size before reading.");
    }
}
