using System.Runtime.InteropServices;

namespace Orithos.HardwareConnect;

internal static class RawPrinterHelper
{
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool OpenPrinter(string? pPrinterName, out nint phPrinter, nint pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(nint hPrinter);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool StartDocPrinter(nint hPrinter, int level, ref DOC_INFO_1 di);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndDocPrinter(nint hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool StartPagePrinter(nint hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndPagePrinter(nint hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool WritePrinter(nint hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DOC_INFO_1
    {
        public string? pDocName;
        public string? pOutputFile;
        public string? pDatatype;
    }

    public static bool SendBytesToPrinter(string printerName, byte[] bytes)
    {
        if (bytes.Length == 0) return true;

        if (!OpenPrinter(printerName, out var hPrinter, nint.Zero))
        {
            return false;
        }

        try
        {
            var doc = new DOC_INFO_1
            {
                pDocName = AgentVersion.Product,
                pDatatype = "RAW",
            };
            if (!StartDocPrinter(hPrinter, 1, ref doc))
            {
                return false;
            }

            var pageStarted = false;
            var writeSucceeded = false;
            var bytesWritten = 0;
            var pageEnded = false;
            var documentEnded = false;
            try
            {
                pageStarted = StartPagePrinter(hPrinter);
                if (pageStarted)
                {
                    writeSucceeded = WritePrinter(hPrinter, bytes, bytes.Length, out bytesWritten);
                }
            }
            finally
            {
                try
                {
                    if (pageStarted) pageEnded = EndPagePrinter(hPrinter);
                }
                finally
                {
                    documentEnded = EndDocPrinter(hPrinter);
                }
            }

            return RawPrinterResultPolicy.IsSuccessful(
                pageStarted,
                writeSucceeded,
                bytes.Length,
                bytesWritten,
                pageEnded,
                documentEnded);
        }
        finally
        {
            ClosePrinter(hPrinter);
        }
    }
}
