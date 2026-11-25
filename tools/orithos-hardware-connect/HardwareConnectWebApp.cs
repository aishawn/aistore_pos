using System.Drawing.Printing;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Orithos.HardwareConnect;

internal static class HardwareConnectWebApp
{
    public static Task RunAsync(CancellationToken cancellationToken) => RunAsync(cancellationToken, null);

    public static async Task RunAsync(CancellationToken cancellationToken, Action? onStarted)
    {
        var listenUrl = Environment.GetEnvironmentVariable("ORITHOS_HC_URL") ?? AgentVersion.DefaultListen;
        if (!LocalRequestSecurity.IsLoopbackListenUrl(listenUrl))
        {
            throw new InvalidOperationException("ORITHOS_HC_URL must use localhost or a loopback IP address.");
        }

        var json = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 1_048_576);
        builder.WebHost.UseUrls(listenUrl);
        await using var app = builder.Build();

        app.Use(async (ctx, next) =>
        {
            var origin = ctx.Request.Headers.Origin.ToString();
            if (!string.IsNullOrEmpty(origin) && !LocalRequestSecurity.IsAllowedOrigin(origin))
            {
                ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                return;
            }

            if (!string.IsNullOrEmpty(origin))
            {
                ctx.Response.Headers["Access-Control-Allow-Origin"] = origin;
                ctx.Response.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
                ctx.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type";
                ctx.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
                ctx.Response.Headers["Vary"] = "Origin";
            }

            if (HttpMethods.IsOptions(ctx.Request.Method))
            {
                if (string.IsNullOrEmpty(origin))
                {
                    ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                    return;
                }

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

        app.MapGet("/v1/printer-status", () => Results.Json(new
        {
            source = "windows-spooler",
            physicalDeviceVerified = false,
            printers = InstalledPrinters().Select(PrinterQueueStatus.Read),
        }, json));

        app.MapPost("/v1/print/text", async (HttpRequest request) =>
        {
            PrintTextRequest? payload;
            try
            {
                payload = await JsonSerializer.DeserializeAsync<PrintTextRequest>(request.Body, json, cancellationToken);
            }
            catch (JsonException)
            {
                return Results.BadRequest(new { error = "Request body must be valid JSON." });
            }

            if (payload is null || string.IsNullOrWhiteSpace(payload.Printer) || string.IsNullOrWhiteSpace(payload.Text))
            {
                return Results.BadRequest(new { error = "printer and text are required" });
            }

            if (payload.Text.Length > HardwareRequestValidation.MaxTextLength)
            {
                return Results.BadRequest(new { error = $"text must not exceed {HardwareRequestValidation.MaxTextLength} characters" });
            }

            Encoding encoding;
            try
            {
                encoding = string.IsNullOrWhiteSpace(payload.Encoding) ? Encoding.UTF8 : Encoding.GetEncoding(payload.Encoding);
            }
            catch (ArgumentException)
            {
                return Results.BadRequest(new { error = "encoding is not supported" });
            }

            var bytes = encoding.GetBytes(payload.Text);
            if (!RawPrinterHelper.SendBytesToPrinter(payload.Printer, bytes))
            {
                return Results.Problem("Raw print failed", statusCode: StatusCodes.Status502BadGateway);
            }

            return Results.Json(new { printed = true, bytes = bytes.Length }, json);
        });

        app.MapPost("/v1/print/raw", async (HttpRequest request) =>
        {
            PrintRawRequest? payload;
            try
            {
                payload = await JsonSerializer.DeserializeAsync<PrintRawRequest>(request.Body, json, cancellationToken);
            }
            catch (JsonException)
            {
                return Results.BadRequest(new { error = "Request body must be valid JSON." });
            }

            if (payload is null || string.IsNullOrWhiteSpace(payload.Printer) || !HardwareRequestValidation.IsValidRawBytes(payload.Bytes))
            {
                return Results.BadRequest(new { error = "printer and bytes are required; bytes must contain values from 0 to 255 within the supported size limit" });
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
            CashDrawerRequest? payload;
            try
            {
                payload = await JsonSerializer.DeserializeAsync<CashDrawerRequest>(request.Body, json, cancellationToken);
            }
            catch (JsonException)
            {
                return Results.BadRequest(new { error = "Request body must be valid JSON." });
            }

            if (payload is null || string.IsNullOrWhiteSpace(payload.Printer) || !HardwareRequestValidation.IsValidRawBytes(payload.Bytes))
            {
                return Results.BadRequest(new { error = "printer and bytes are required; bytes must contain values from 0 to 255 within the supported size limit" });
            }

            var bytes = payload.Bytes.Select(b => (byte)b).ToArray();
            if (!RawPrinterHelper.SendBytesToPrinter(payload.Printer, bytes))
            {
                return Results.Problem("Cash drawer pulse failed", statusCode: StatusCodes.Status502BadGateway);
            }

            return Results.Json(new { kicked = true }, json);
        });

        app.MapGet("/v1/shelf-export", () =>
        {
            var shelfSettings = ShelfExportSettings.Load();
            return Results.Json(new
            {
                templateDirectory = shelfSettings.TemplateDirectory,
                exportDirectory = shelfSettings.ExportDirectory,
                defaultExportDirectory = ShelfExportSettings.DefaultExportDirectory,
            }, json);
        });

        app.MapPost("/v1/shelf-export", async (HttpRequest request) =>
        {
            var shelfSettings = ShelfExportSettings.Load();
            ShelfExportRequest? payload;
            try
            {
                payload = await JsonSerializer.DeserializeAsync<ShelfExportRequest>(request.Body, json, cancellationToken);
            }
            catch (JsonException)
            {
                return Results.BadRequest(new { error = "Request body must be valid JSON." });
            }

            if ((payload?.TemplateDirectory?.Length ?? 0) > 32_767 || (payload?.ExportDirectory?.Length ?? 0) > 32_767)
            {
                return Results.BadRequest(new { error = "Shelf export paths must not exceed 32,767 characters." });
            }

            shelfSettings.Apply(payload?.TemplateDirectory, payload?.ExportDirectory, persist: true);
            return Results.Json(new
            {
                saved = true,
                templateDirectory = shelfSettings.TemplateDirectory,
                exportDirectory = shelfSettings.ExportDirectory,
            }, json);
        });

        await app.StartAsync(cancellationToken);
        onStarted?.Invoke();
        await app.WaitForShutdownAsync(cancellationToken);
    }

    private static string[] InstalledPrinters()
    {
        return PrinterSettings.InstalledPrinters.Cast<string>().OrderBy(name => name, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private sealed record PrintTextRequest(string Printer, string Text, string? Encoding);
    private sealed record PrintRawRequest(string Printer, int[] Bytes);
    private sealed record CashDrawerRequest(string Printer, int[] Bytes);
    private sealed record ShelfExportRequest(string? TemplateDirectory, string? ExportDirectory);
}
