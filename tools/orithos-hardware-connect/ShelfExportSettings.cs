using System.Text.Json;

namespace Orithos.HardwareConnect;

internal sealed class ShelfExportSettings
{
    public string TemplateDirectory { get; private set; }

    public string ExportDirectory { get; private set; }

    private ShelfExportSettings(string templateDirectory, string exportDirectory)
    {
        TemplateDirectory = templateDirectory;
        ExportDirectory = exportDirectory;
    }

    public static string SettingsFilePath { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Orithos",
        "HardwareConnect",
        "shelf-export.json");

    public static string DefaultExportDirectory { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Orithos",
        "HardwareConnect",
        "shelf-export");

    public static ShelfExportSettings Load()
    {
        var template = "";
        var export = DefaultExportDirectory;
        if (File.Exists(SettingsFilePath))
        {
            try
            {
                var json = JsonSerializer.Deserialize<PersistedShelfExport>(File.ReadAllText(SettingsFilePath));
                if (json is not null)
                {
                    if (!string.IsNullOrWhiteSpace(json.TemplateDirectory)) template = json.TemplateDirectory.Trim();
                    if (!string.IsNullOrWhiteSpace(json.ExportDirectory)) export = json.ExportDirectory.Trim();
                }
            }
            catch
            {
                /* ignore */
            }
        }

        return new ShelfExportSettings(template, export);
    }

    public void Apply(string? templateDirectory, string? exportDirectory, bool persist)
    {
        if (!string.IsNullOrWhiteSpace(templateDirectory))
        {
            TemplateDirectory = templateDirectory.Trim();
        }

        if (!string.IsNullOrWhiteSpace(exportDirectory))
        {
            ExportDirectory = exportDirectory.Trim();
        }

        if (persist)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(SettingsFilePath)!);
            try
            {
                Directory.CreateDirectory(ExportDirectory);
            }
            catch
            {
                /* user may fix path later */
            }

            var payload = JsonSerializer.Serialize(new PersistedShelfExport(TemplateDirectory, ExportDirectory));
            File.WriteAllText(SettingsFilePath, payload);
        }
    }

    private sealed record PersistedShelfExport(string TemplateDirectory, string ExportDirectory);
}