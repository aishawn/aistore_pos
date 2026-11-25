namespace Orithos.HardwareConnect;

internal static class ConnectorRequestValidation
{
    public const int MaxOrithosApiUrlLength = 2_048;
    public const int MaxConnectorTokenLength = 16_384;
    public const int MaxConnectorChallengeLength = 8_192;
    public const int MaxOrderUuidLength = 256;

    public static bool IsValidConfig(string? apiUrl, string? token) =>
        !string.IsNullOrWhiteSpace(apiUrl)
        && apiUrl.Length <= MaxOrithosApiUrlLength
        && (token?.Length ?? 0) <= MaxConnectorTokenLength;

    public static bool IsValidTransaction(ConnectorRequestFields? request) =>
        request is not null
        && request.AttemptId > 0
        && !string.IsNullOrWhiteSpace(request.ConnectorChallenge)
        && request.ConnectorChallenge.Length <= MaxConnectorChallengeLength
        && (request.OrderUuid?.Length ?? 0) <= MaxOrderUuidLength;

    internal sealed record ConnectorRequestFields(long AttemptId, string? ConnectorChallenge, string? OrderUuid);
}
