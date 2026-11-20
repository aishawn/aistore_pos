using System.Drawing;
using System.Reflection;

namespace Orithos.HardwareConnect;

internal static class BrandAssets
{
    public static Image? LoadLogoImage()
    {
        var baseDir = Path.GetDirectoryName(Environment.ProcessPath ?? AppContext.BaseDirectory);
        if (!string.IsNullOrWhiteSpace(baseDir))
        {
            foreach (var candidate in new[]
                     {
                         Path.Combine(baseDir, "assets", "orithos-hc-logo.png"),
                         Path.Combine(AppContext.BaseDirectory, "assets", "orithos-hc-logo.png"),
                         Path.Combine(RegisterAgentInstaller.InstallDir, "assets", "orithos-hc-logo.png"),
                     })
            {
                if (File.Exists(candidate))
                {
                    return Image.FromFile(candidate);
                }
            }
        }

        var asm = Assembly.GetExecutingAssembly();
        var resource = asm.GetManifestResourceNames()
            .FirstOrDefault(n => n.EndsWith("orithos-hc-logo.png", StringComparison.OrdinalIgnoreCase));
        if (resource is null) return null;

        using var stream = asm.GetManifestResourceStream(resource);
        return stream is null ? null : Image.FromStream(stream);
    }

    public static Icon? LoadApplicationIcon()
    {
        foreach (var candidate in IconCandidates())
        {
            if (File.Exists(candidate))
            {
                return new Icon(candidate);
            }
        }

        using var image = LoadLogoImage();
        if (image is not Bitmap bitmap) return null;
        return Icon.FromHandle(bitmap.GetHicon());
    }

    public static Icon? LoadTrayIcon() => LoadApplicationIcon();

    private static IEnumerable<string> IconCandidates()
    {
        var baseDir = Path.GetDirectoryName(Environment.ProcessPath ?? AppContext.BaseDirectory);
        if (!string.IsNullOrWhiteSpace(baseDir))
        {
            yield return Path.Combine(baseDir, "assets", "orithos-hc.ico");
            yield return Path.Combine(AppContext.BaseDirectory, "assets", "orithos-hc.ico");
        }

        yield return Path.Combine(RegisterAgentInstaller.InstallDir, "assets", "orithos-hc.ico");
    }
}