using System.Drawing.Printing;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Orithos.HardwareConnect;

internal static class HardwareConnectWebApp
{
    public static async Task RunAsync(CancellationToken cancellationToken)
    {
        var listenUrl = Environment.GetEnvironmentVariable("ORITHOS_HC_URL") ?? AgentVersion.DefaultListen;

        var json = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };

        var builder = WebApplication.CreateBuilder();
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
            product = AgentVersion.Product,
            version = AgentVersion.DisplayVersion,
        }, json));

        app.MapGet("/v1/status", () =>
        {
            var printers = InstalledPrinters();
            return Results.Json(new
            {
                product = AgentVersion.Product,
                version = AgentVersion.DisplayVersion,
                listenUrl,
                printerCount = printers.Length,
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

        await app.RunAsync(cancellationToken);
    }

    private static string[] InstalledPrinters()
    {
        return PrinterSettings.InstalledPrinters.Cast<string>().OrderBy(name => name, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private sealed record PrintTextRequest(string Printer, string Text, string? Encoding);
    private sealed record PrintRawRequest(string Printer, int[] Bytes);
    private sealed record CashDrawerRequest(string Printer, int[] Bytes);
}