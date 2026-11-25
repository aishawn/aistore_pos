using System.Runtime.InteropServices;

namespace Orithos.HardwareConnect;

internal static class PrinterQueueStatus
{
    private const int PrinterInfoLevel6 = 6;
    private const int PrinterStatusPaused = 0x00000001;
    private const int PrinterStatusError = 0x00000002;
    private const int PrinterStatusPaperJam = 0x00000008;
    private const int PrinterStatusPaperOut = 0x00000010;
    private const int PrinterStatusPaperProblem = 0x00000040;
    private const int PrinterStatusOffline = 0x00000080;
    private const int PrinterStatusOutputBinFull = 0x00000800;
    private const int PrinterStatusNotAvailable = 0x00001000;
    private const int PrinterStatusTonerLow = 0x00020000;
    private const int PrinterStatusNoToner = 0x00040000;
    private const int PrinterStatusUserIntervention = 0x00100000;
    private const int PrinterStatusOutOfMemory = 0x00200000;
    private const int PrinterStatusDoorOpen = 0x00400000;
    private const int PrinterStatusServerUnknown = 0x00800000;
    private const int KnownStatusFlags = 0x01ffffff;

    private const int AttentionFlags = PrinterStatusPaused
        | PrinterStatusError
        | PrinterStatusPaperJam
        | PrinterStatusPaperOut
        | PrinterStatusPaperProblem
        | PrinterStatusOffline
        | PrinterStatusOutputBinFull
        | PrinterStatusNotAvailable
        | PrinterStatusTonerLow
        | PrinterStatusNoToner
        | PrinterStatusUserIntervention
        | PrinterStatusOutOfMemory
        | PrinterStatusDoorOpen
        | PrinterStatusServerUnknown;

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool OpenPrinter(string printerName, out nint printerHandle, nint defaults);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(nint printerHandle);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool GetPrinter(nint printerHandle, int level, nint printerInfo, int bufferSize, out int needed);

    public static PrinterQueueObservation Read(string printerName)
    {
        if (!OpenPrinter(printerName, out var handle, nint.Zero))
        {
            return new PrinterQueueObservation(printerName, "unknown", null, "Windows could not open this printer queue.");
        }

        try
        {
            GetPrinter(handle, PrinterInfoLevel6, nint.Zero, 0, out var needed);
            if (needed < sizeof(int))
            {
                var error = Marshal.GetLastWin32Error();
                return new PrinterQueueObservation(printerName, "unknown", null, $"Windows printer status query failed (error {error}).");
            }

            var buffer = Marshal.AllocHGlobal(needed);
            try
            {
                if (!GetPrinter(handle, PrinterInfoLevel6, buffer, needed, out _))
                {
                    var error = Marshal.GetLastWin32Error();
                    return new PrinterQueueObservation(printerName, "unknown", null, $"Windows printer status query failed (error {error}).");
                }

                var flags = Marshal.ReadInt32(buffer);
                return new PrinterQueueObservation(
                    printerName,
                    Classify(flags),
                    flags,
                    string.Join(", ", DescribeFlags(flags)));
            }
            finally
            {
                Marshal.FreeHGlobal(buffer);
            }
        }
        finally
        {
            ClosePrinter(handle);
        }
    }

    public static string Classify(int flags) =>
        (flags & AttentionFlags) != 0 ? "attention"
        : (flags & ~KnownStatusFlags) != 0 ? "unknown"
        : "clear";

    public static string[] DescribeFlags(int flags)
    {
        var descriptions = new List<string>();
        Add(PrinterStatusPaused, "paused");
        Add(PrinterStatusError, "error");
        Add(PrinterStatusPaperJam, "paper jam");
        Add(PrinterStatusPaperOut, "paper out");
        Add(PrinterStatusPaperProblem, "paper problem");
        Add(PrinterStatusOffline, "offline");
        Add(PrinterStatusOutputBinFull, "output bin full");
        Add(PrinterStatusNotAvailable, "not available");
        Add(PrinterStatusTonerLow, "toner low");
        Add(PrinterStatusNoToner, "no toner");
        Add(PrinterStatusUserIntervention, "user intervention required");
        Add(PrinterStatusOutOfMemory, "printer memory error");
        Add(PrinterStatusDoorOpen, "door open");
        Add(PrinterStatusServerUnknown, "print server unknown");
        return descriptions.ToArray();

        void Add(int flag, string description)
        {
            if ((flags & flag) != 0) descriptions.Add(description);
        }
    }
}

internal sealed record PrinterQueueObservation(string Printer, string Status, int? Flags, string? Detail);
