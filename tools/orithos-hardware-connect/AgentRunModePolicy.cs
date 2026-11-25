namespace Orithos.HardwareConnect;

internal static class AgentRunModePolicy
{
    public static bool IsConsoleMode(IEnumerable<string> args, string? consoleEnvironment) =>
        args.Any(argument => string.Equals(argument, "--console", StringComparison.OrdinalIgnoreCase))
        || string.Equals(consoleEnvironment, "1", StringComparison.Ordinal);
}
