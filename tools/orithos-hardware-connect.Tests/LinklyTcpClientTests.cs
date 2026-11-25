using System.Net;
using System.Net.Sockets;
using System.Text;
using Orithos.HardwareConnect;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class LinklyTcpClientTests
{
    [Fact]
    public async Task PurchaseUsesOfficialFixedWidthFrameAndMapsApproval()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var endpoint = new LinklyTcpEndpoint("127.0.0.1", ((IPEndPoint)listener.LocalEndpoint).Port);
        var server = Task.Run(async () =>
        {
            using var client = await listener.AcceptTcpClientAsync();
            await using var stream = client.GetStream();
            var header = await ReadExactly(stream, 5);
            var length = int.Parse(Encoding.ASCII.GetString(header, 1, 4));
            var payload = await ReadExactly(stream, length - 5);
            var request = Encoding.ASCII.GetString(payload);
            Assert.Equal('#', (char)header[0]);
            Assert.Equal(length, 5 + payload.Length);
            Assert.Equal("M0", request[..2]);
            Assert.Equal('P', request[4]);
            Assert.Equal("000001250", request.Substring(16, 9));
            Assert.Equal("O42".PadRight(16), request.Substring(31, 16));
            var responseFields = Enumerable.Repeat(' ', 225).ToArray();
            responseFields[0] = 'M';
            responseFields[1] = '0';
            responseFields[2] = '1';
            responseFields[3] = '0';
            responseFields[4] = '0';
            "APPROVED".CopyTo(0, responseFields, 5, 8);
            "O42".PadRight(16).CopyTo(0, responseFields, 68, 16);
            "RRN123456789".CopyTo(0, responseFields, 213, 12);
            var responseBody = new string(responseFields);
            var response = Encoding.ASCII.GetBytes("#" + (5 + responseBody.Length).ToString("D4") + responseBody);
            await stream.WriteAsync(response);
        });

        try
        {
            var result = await LinklyTcpClient.PurchaseAsync(endpoint, 1250, "O42", CancellationToken.None);
            Assert.Equal("APPROVED", result.Status);
            Assert.Equal("00", result.ResponseCode);
            Assert.Equal("O42", result.TransactionReference);
            Assert.Equal("RRN123456789", result.ProviderReference);
            await server;
        }
        finally
        {
            listener.Stop();
        }
    }

    [Fact]
    public async Task GetLastTransactionUsesN0Command()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var endpoint = new LinklyTcpEndpoint("127.0.0.1", ((IPEndPoint)listener.LocalEndpoint).Port);
        var server = Task.Run(async () =>
        {
            using var client = await listener.AcceptTcpClientAsync();
            await using var stream = client.GetStream();
            var header = await ReadExactly(stream, 5);
            var length = int.Parse(Encoding.ASCII.GetString(header, 1, 4));
            var payload = await ReadExactly(stream, length - 5);
            var request = Encoding.ASCII.GetString(payload);
            Assert.Equal("N0", request[..2]);
            Assert.Equal("O99".PadRight(16), request.Substring(6, 16));
            var responseFields = Enumerable.Repeat(' ', 226).ToArray();
            responseFields[0] = 'N';
            responseFields[1] = '0';
            responseFields[2] = '1';
            responseFields[3] = '1';
            responseFields[4] = '0';
            responseFields[5] = '0';
            "APPROVED".CopyTo(0, responseFields, 6, 8);
            "O99".PadRight(16).CopyTo(0, responseFields, 69, 16);
            var responseBody = new string(responseFields);
            var response = Encoding.ASCII.GetBytes("#" + (5 + responseBody.Length).ToString("D4") + responseBody);
            await stream.WriteAsync(response);
        });

        try
        {
            var result = await LinklyTcpClient.GetLastTransactionAsync(endpoint, "O99", CancellationToken.None);
            Assert.Equal("APPROVED", result.Status);
            Assert.Equal("O99", result.TransactionReference);
            await server;
        }
        finally
        {
            listener.Stop();
        }
    }

    private static async Task<byte[]> ReadExactly(NetworkStream stream, int count)
    {
        var bytes = new byte[count];
        var offset = 0;
        while (offset < count)
        {
            var read = await stream.ReadAsync(bytes.AsMemory(offset, count - offset));
            if (read == 0) throw new EndOfStreamException();
            offset += read;
        }
        return bytes;
    }
}
