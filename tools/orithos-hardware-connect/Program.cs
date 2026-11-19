using System.Drawing.Printing;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

const string Product = "Orithos Hardware Connect";
const string Version = "0.1.0.0";
const string DefaultListen = "http://127.0.0.1:9170/";

var listenUrl = Environment.GetEnvironmentVariable("ORITHOS_HC_URL") ?? DefaultListen;

var json = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
};

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(listenUrl);
var app = builder.Build();

app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["Access-Control-Allow-Origin"] = "*";
    ctx.Response.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
    ctx.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type";
    if (HttpMethods.IsOptions(ctx.Request.Method))
    {
        ctx.Response.StatusCode = StatusCodes.Status204NoContent;
        return;
    }

    await next();
});

app.MapGet("/v1/health", () => Results.Json(new
{
    ok = true,
    product = Product,
    version = Version,
}, json));

app.MapGet("/v1/status", () =>
{
    var printers = InstalledPrinters();
    return Results.Json(new
    {
        product = Product,
        version = Version,
        printers = printers.Length,
    }, json);
});

app.MapGet("/v1/printers", () => Results.Json(new { printers = InstalledPrinters() }, json));

app.MapPost("/v1/print/text", async (HttpRequest request) =>
{
    var payload = await JsonSerializer.DeserializeAsync<PrintTextRequest>(request.Body, json);
    if (payload is null || string.IsNullOrWhiteSpace(payload.Printer) || string.IsNullOrWhiteSpace(payload.Text))
    {
        return Results.BadRequest(new { error = "printer and text are required" });
    }

    var encoding = string.IsNullOrWhiteSpace(payload.Encoding) ? Encoding.UTF8 : Encoding.GetEncoding(payload.Encoding);
    var bytes = encoding.GetBytes(payload.Text);
    if (!RawPrinterHelper.SendBytesToPrinter(payload.Printer, bytes))
    {
        return Results.Problem("Raw print failed", statusCode: StatusCodes.Status502BadGateway);
    }

    return Results.Json(new { printed = true, bytes = bytes.Length }, json);
});

app.MapPost("/v1/print/raw", async (HttpRequest request) =>
{
    var payload = await JsonSerializer.DeserializeAsync<PrintRawRequest>(request.Body, json);
    if (payload is null || string.IsNullOrWhiteSpace(payload.Printer) || payload.Bytes is not { Length: > 0 })
    {
        return Results.BadRequest(new { error = "printer and bytes are required" });
    }

    var bytes = payload.Bytes.Select(b => (byte)b).ToArray();
    if (!RawPrinterHelper.SendBytesToPrinter(payload.Printer, bytes))
    {
        return Results.Problem("Raw print failed", statusCode: StatusCodes.Status502BadGateway);
    }

    return Results.Json(new { printed = true, bytes = bytes.Length }, json);
});

app.MapPost("/v1/cash-drawer/kick", async (HttpRequest request) =>
{
    var payload = await JsonSerializer.DeserializeAsync<CashDrawerRequest>(request.Body, json);
    if (payload is null || string.IsNullOrWhiteSpace(payload.Printer) || payload.Bytes is not { Length: > 0 })
    {
        return Results.BadRequest(new { error = "printer and bytes are required" });
    }

    var bytes = payload.Bytes.Select(b => (byte)b).ToArray();
    if (!RawPrinterHelper.SendBytesToPrinter(payload.Printer, bytes))
    {
        return Results.Problem("Cash drawer pulse failed", statusCode: StatusCodes.Status502BadGateway);
    }

    return Results.Json(new { kicked = true }, json);
});

Console.WriteLine($"{Product} {Version} listening on {listenUrl}");
app.Run();

static string[] InstalledPrinters()
{
    return PrinterSettings.InstalledPrinters.Cast<string>().OrderBy(name => name, StringComparer.OrdinalIgnoreCase).ToArray();
}

internal sealed record PrintTextRequest(string Printer, string Text, string? Encoding);
internal sealed record PrintRawRequest(string Printer, int[] Bytes);
internal sealed record CashDrawerRequest(string Printer, int[] Bytes);

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
                pDocName = "Orithos Hardware Connect",
                pDatatype = "RAW",
            };
            if (!StartDocPrinter(hPrinter, 1, ref doc))
            {
                return false;
            }

            try
            {
                if (!StartPagePrinter(hPrinter))
                {
                    return false;
                }

                var ok = WritePrinter(hPrinter, bytes, bytes.Length, out _);
                EndPagePrinter(hPrinter);
                return ok;
            }
            finally
            {
                EndDocPrinter(hPrinter);
            }
        }
        finally
        {
            ClosePrinter(hPrinter);
        }
    }
}