namespace Orithos.HardwareConnect;

internal static class RawPrinterResultPolicy
{
    public static bool IsSuccessful(
        bool pageStarted,
        bool writeSucceeded,
        int requestedBytes,
        int writtenBytes,
        bool pageEnded,
        bool documentEnded) =>
        pageStarted
        && writeSucceeded
        && requestedBytes > 0
        && writtenBytes == requestedBytes
        && pageEnded
        && documentEnded;
}
