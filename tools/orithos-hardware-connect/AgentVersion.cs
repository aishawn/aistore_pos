using System.Reflection;

namespace Orithos.HardwareConnect;

internal static class AgentVersion
{
    public const string Product = "Orithos Hardware Connect";

    public static string DisplayVersion { get; } =
        Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "1.0.0.0";

    public const string DefaultListen = "http://127.0.0.1:9170/";
}