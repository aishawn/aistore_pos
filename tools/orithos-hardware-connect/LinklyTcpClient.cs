using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace Orithos.HardwareConnect;

internal sealed record LinklyTcpEndpoint(string Host, int Port)
{
    public string Display => $"{Host}:{Port}";

    public static async Task<LinklyTcpEndpoint?> DiscoverAsync(CancellationToken cancellationToken)
    {
        var host = (Environment.GetEnvironmentVariable("ORITHOS_LINKLY_TCP_HOST") ?? "127.0.0.1").Trim();
        if (!IsLoopbackHost(host)) return null;
        var configuredPort = Environment.GetEnvironmentVariable("ORITHOS_LINKLY_TCP_PORT")?.Trim();
        if (!string.IsNullOrEmpty(configuredPort))
        {
            if (!int.TryParse(configuredPort, NumberStyles.None, CultureInfo.InvariantCulture, out var port)
                || port is < 1 or > 65535) return null;
            return await CanConnectAsync(new LinklyTcpEndpoint(host, port), cancellationToken) ? new(host, port) : null;
        }

        // Linkly's current documented default is 2011.  2005 is retained as a
        // compatibility probe for older PC-EFTPOS installations.
        foreach (var candidatePort in new[] { 2011, 2005 })
        {
            var candidate = new LinklyTcpEndpoint(host, candidatePort);
            if (await CanConnectAsync(candidate, cancellationToken)) return candidate;
        }

        return null;
    }

    private static bool IsLoopbackHost(string host) =>
        host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
        || IPAddress.TryParse(host, out var address) && IPAddress.IsLoopback(address);

    public static async Task<bool> CanConnectAsync(LinklyTcpEndpoint endpoint, CancellationToken cancellationToken)
    {
        try
        {
            using var client = new TcpClient();
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromMilliseconds(500));
            await client.ConnectAsync(endpoint.Host, endpoint.Port, timeout.Token);
            return client.Connected;
        }
        catch (SocketException) { return false; }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { return false; }
    }
}

internal sealed record LinklyTcpResult(string Status, string? TransactionReference, string? ProviderReference, string ResponseCode, string ResponseText);

internal static class LinklyTcpClient
{
    private const int MaxFrameLength = 16_384;

    public static async Task<LinklyTcpResult> PurchaseAsync(
        LinklyTcpEndpoint endpoint, int amountCents, string txnRef, CancellationToken cancellationToken)
    {
        var body = BuildTransactionRequest('P', amountCents, txnRef);
        return await SendTransactionAsync(endpoint, body, cancellationToken);
    }

    public static async Task<LinklyTcpResult> GetLastTransactionAsync(
        LinklyTcpEndpoint endpoint, string txnRef, CancellationToken cancellationToken)
    {
        var body = BuildGetLastTransactionRequest(txnRef);
        return await SendTransactionAsync(endpoint, body, cancellationToken);
    }

    private static async Task<LinklyTcpResult> SendTransactionAsync(
        LinklyTcpEndpoint endpoint, string body, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(90));
        using var client = new TcpClient();
        await client.ConnectAsync(endpoint.Host, endpoint.Port, timeout.Token);
        await using var stream = client.GetStream();
        var frame = EncodeFrame(body);
        await stream.WriteAsync(frame, timeout.Token);
        await stream.FlushAsync(timeout.Token);

        while (true)
        {
            var response = await ReadFrameAsync(stream, timeout.Token);
            if (response.Length < 8) throw new InvalidDataException("Linkly TCP response is too short.");
            var command = response[5];
            if (command is 'M' or 'N')
            {
                return ParseResult(response, command);
            }

            // Receipt/display events are not requested by this integration: the
            // purchase asks Linkly to print on the terminal (ReceiptAutoPrint=9).
            // If a client still sends an unsolicited event, fail closed rather
            // than pretending the payment was approved.
            throw new InvalidDataException($"Unsupported Linkly TCP event '{command}'.");
        }
    }

    private static string BuildTransactionRequest(char txnType, int amountCents, string txnRef)
    {
        if (amountCents is <= 0 or > 999_999_999) throw new ArgumentOutOfRangeException(nameof(amountCents));
        var amount = amountCents.ToString("D9", CultureInfo.InvariantCulture);
        var reference = Fixed(txnRef, 16);
        var body = "M0" + "00" + txnType + "0" + "0" + "" + "000000000" + amount
            + new string(' ', 6) + reference + "9" + "0" + " " + new string(' ', 20)
            + "    " + new string(' ', 40) + " " + "00" + new string(' ', 12)
            + new string(' ', 3) + " " + new string(' ', 6) + new string(' ', 6)
            + new string(' ', 8) + "000";
        return body;
    }

    private static string BuildGetLastTransactionRequest(string txnRef) =>
        "N0" + "00" + "00" + Fixed(txnRef, 16);

    private static byte[] EncodeFrame(string body)
    {
        var length = 5 + body.Length;
        if (length > 9999) throw new InvalidDataException("Linkly TCP request is too long.");
        return Encoding.ASCII.GetBytes("#" + length.ToString("D4", CultureInfo.InvariantCulture) + body);
    }

    private static async Task<string> ReadFrameAsync(NetworkStream stream, CancellationToken cancellationToken)
    {
        var header = await ReadExactlyAsync(stream, 5, cancellationToken);
        if (header[0] != (byte)'#' || !int.TryParse(Encoding.ASCII.GetString(header, 1, 4), out var length)
            || length < 5 || length > MaxFrameLength)
            throw new InvalidDataException("Invalid Linkly TCP frame header.");
        var payload = await ReadExactlyAsync(stream, length - 5, cancellationToken);
        return Encoding.ASCII.GetString(header) + Encoding.ASCII.GetString(payload);
    }

    private static async Task<byte[]> ReadExactlyAsync(NetworkStream stream, int count, CancellationToken cancellationToken)
    {
        var buffer = new byte[count];
        var offset = 0;
        while (offset < count)
        {
            var read = await stream.ReadAsync(buffer.AsMemory(offset, count - offset), cancellationToken);
            if (read == 0) throw new EndOfStreamException("Linkly TCP connection closed before the response completed.");
            offset += read;
        }
        return buffer;
    }

    private static LinklyTcpResult ParseResult(string frame, char command)
    {
        var success = frame.Length > (command == 'M' ? 7 : 8)
            && frame[command == 'M' ? 7 : 8] == '1';
        var codeOffset = command == 'M' ? 8 : 9;
        var textOffset = command == 'M' ? 10 : 11;
        var code = frame.Length >= codeOffset + 2 ? frame.Substring(codeOffset, 2).Trim() : "";
        var text = frame.Length >= textOffset + 20 ? frame.Substring(textOffset, 20).Trim() : "";
        var transactionReferenceOffset = command == 'M' ? 73 : 74;
        var providerReferenceOffset = command == 'M' ? 218 : 219;
        var transactionReference = frame.Length >= transactionReferenceOffset + 16
            ? frame.Substring(transactionReferenceOffset, 16).Trim() : null;
        var providerReference = frame.Length >= providerReferenceOffset + 12
            ? frame.Substring(providerReferenceOffset, 12).Trim() : null;
        var status = success && code is "00" or "08" ? "APPROVED" : code is "" or "X0" or "P7" or "S7" or "S8"
            ? "UNKNOWN" : "DECLINED";
        return new LinklyTcpResult(
            status,
            string.IsNullOrWhiteSpace(transactionReference) ? null : transactionReference,
            string.IsNullOrWhiteSpace(providerReference) ? null : providerReference,
            code,
            text);
    }

    private static string Fixed(string value, int length)
    {
        var clean = new string(value.Where(ch => ch is >= ' ' and <= '~').ToArray());
        return clean.Length > length ? clean[..length] : clean.PadRight(length, ' ');
    }
}
