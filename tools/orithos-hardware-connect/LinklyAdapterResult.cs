using System.Text.Json;

namespace Orithos.HardwareConnect;

internal sealed record LinklyAdapterResult(string Status, string? ProviderReference)
{
    private static readonly HashSet<string> SupportedStatuses = new(StringComparer.Ordinal)
    {
        "APPROVED",
        "APPROVED_PENDING_SETTLEMENT",
        "DECLINED",
        "CANCELLED",
        "UNKNOWN",
    };

    public static bool TryParse(string responseBody, out LinklyAdapterResult? result)
    {
        result = null;
        try
        {
            using var document = JsonDocument.Parse(responseBody);
            if (document.RootElement.ValueKind != JsonValueKind.Object
                || !TryGetString(document.RootElement, "status", out var status)
                || !SupportedStatuses.Contains(status.Trim().ToUpperInvariant()))
            {
                return false;
            }

            string? providerReference = null;
            if (document.RootElement.TryGetProperty("providerReference", out var referenceElement))
            {
                if (referenceElement.ValueKind != JsonValueKind.String) return false;
                providerReference = referenceElement.GetString()?.Trim();
                if (providerReference is { Length: > 256 }) return false;
                if (providerReference?.Length == 0) providerReference = null;
            }

            result = new LinklyAdapterResult(status.Trim().ToUpperInvariant(), providerReference);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static bool TryGetString(JsonElement element, string propertyName, out string value)
    {
        value = "";
        if (!element.TryGetProperty(propertyName, out var property)
            || property.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        value = property.GetString() ?? "";
        return !string.IsNullOrWhiteSpace(value);
    }
}
