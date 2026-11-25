using System.Text;

namespace Orithos.HardwareConnect;

internal static class BoundedResponseReader
{
    public const int MaximumBodyBytes = 1_048_576;

    public static async Task<string> ReadAsync(
        Stream source,
        long? contentLength,
        CancellationToken cancellationToken,
        int maximumBytes = MaximumBodyBytes)
    {
        if (maximumBytes < 1) throw new ArgumentOutOfRangeException(nameof(maximumBytes));
        if (contentLength > maximumBytes)
            throw new InvalidDataException("Adapter response exceeds the maximum allowed size.");

        using var destination = new MemoryStream();
        var buffer = new byte[81920];
        while (true)
        {
            var read = await source.ReadAsync(buffer, cancellationToken);
            if (read == 0) break;
            if (destination.Length + read > maximumBytes)
                throw new InvalidDataException("Adapter response exceeds the maximum allowed size.");

            await destination.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }

        return Encoding.UTF8.GetString(destination.GetBuffer(), 0, (int)destination.Length);
    }
}
