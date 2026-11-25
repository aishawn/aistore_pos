namespace Orithos.HardwareConnect;

internal static class HardwareRequestValidation
{
    public const int MaxTextLength = 256_000;
    public const int MaxRawByteCount = 200_000;

    public static bool IsValidRawBytes(int[]? bytes) =>
        bytes is { Length: > 0 and <= MaxRawByteCount }
        && bytes.All(value => value is >= byte.MinValue and <= byte.MaxValue);
}
