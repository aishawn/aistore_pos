using System.Reflection;
using Xunit;

namespace Orithos.HardwareConnect.Tests;

public sealed class InstallFileTransactionTests
{
    [Fact]
    public void ReplacesBundleFilesAndPreservesRegisterSettingsAndExports()
    {
        WithDirectories((source, install) =>
        {
            Write(source, "OrithosHardwareConnect.exe", "new-agent");
            Write(source, "assets/orithos-hc.ico", "new-icon");
            Write(install, "OrithosHardwareConnect.exe", "old-agent");
            Write(install, "assets/orithos-hc.ico", "old-icon");
            Write(install, "connector-settings.json", "encrypted-token");
            Write(install, "shelf-export.json", "export-settings");
            Write(install, "shelf-export/price-list.csv", "exported-data");
            Write(install, "legacy-agent.dat", "preserve-unmanaged-file");

            ReplaceFiles(source, install, "OrithosHardwareConnect.exe", "assets/orithos-hc.ico");

            Assert.Equal("new-agent", Read(install, "OrithosHardwareConnect.exe"));
            Assert.Equal("new-icon", Read(install, "assets/orithos-hc.ico"));
            Assert.Equal("encrypted-token", Read(install, "connector-settings.json"));
            Assert.Equal("export-settings", Read(install, "shelf-export.json"));
            Assert.Equal("exported-data", Read(install, "shelf-export/price-list.csv"));
            Assert.Equal("preserve-unmanaged-file", Read(install, "legacy-agent.dat"));
        });
    }

    [Fact]
    public void RestoresEveryReplacedFileWhenALaterCopyFails()
    {
        WithDirectories((source, install) =>
        {
            Write(source, "assets/a.ico", "new-icon");
            Write(install, "assets/a.ico", "old-icon");
            Write(install, "connector-settings.json", "encrypted-token");

            var failure = Assert.Throws<TargetInvocationException>(() =>
                ReplaceFiles(source, install, "assets/a.ico", "assets/z-missing.ico"));

            Assert.IsType<FileNotFoundException>(failure.InnerException);
            Assert.Equal("old-icon", Read(install, "assets/a.ico"));
            Assert.Equal("encrypted-token", Read(install, "connector-settings.json"));
            Assert.False(File.Exists(Path.Combine(install, "assets", "z-missing.ico")));
        });
    }

    [Fact]
    public void RestoresPreviousInstallWhenPostInstallVerificationFails()
    {
        WithDirectories((source, install) =>
        {
            Write(source, "OrithosHardwareConnect.exe", "new-agent");
            Write(install, "OrithosHardwareConnect.exe", "old-agent");
            Write(install, "connector-settings.json", "encrypted-token");
            var candidateStopped = false;
            var registrationsRestored = false;

            var failure = Assert.Throws<TargetInvocationException>(() =>
                ReplaceFilesAndVerify(source, install, ["OrithosHardwareConnect.exe"],
                    () => throw new InvalidOperationException("health check failed"),
                    () => candidateStopped = true,
                    () => registrationsRestored = true));

            Assert.IsType<InvalidOperationException>(failure.InnerException);
            Assert.True(candidateStopped);
            Assert.True(registrationsRestored);
            Assert.Equal("old-agent", Read(install, "OrithosHardwareConnect.exe"));
            Assert.Equal("encrypted-token", Read(install, "connector-settings.json"));
        });
    }

    [Fact]
    public void KeepsNewInstallOnlyAfterPostInstallVerificationSucceeds()
    {
        WithDirectories((source, install) =>
        {
            Write(source, "OrithosHardwareConnect.exe", "new-agent");
            Write(install, "OrithosHardwareConnect.exe", "old-agent");

            ReplaceFilesAndVerify(source, install, ["OrithosHardwareConnect.exe"], () => { }, () =>
                throw new InvalidOperationException("rollback must not run after successful verification"));

            Assert.Equal("new-agent", Read(install, "OrithosHardwareConnect.exe"));
        });
    }

    [Fact]
    public void RejectsPathsThatEscapeTheInstallDirectory()
    {
        WithDirectories((source, install) =>
        {
            Write(source, "agent.exe", "new-agent");

            var failure = Assert.Throws<TargetInvocationException>(() => ReplaceFiles(source, install, "..\\outside.txt"));

            Assert.IsType<ArgumentException>(failure.InnerException);
            Assert.False(File.Exists(Path.Combine(Directory.GetParent(install)!.FullName, "outside.txt")));
        });
    }

    [Fact]
    public void DoesNotLeaveInstallDirectoryWhenFirstInstallPayloadIsInvalid()
    {
        var root = Path.Combine(Path.GetTempPath(), $"orithos-hc-install-test-{Guid.NewGuid():N}");
        var source = Path.Combine(root, "source");
        var install = Path.Combine(root, "install");
        Directory.CreateDirectory(source);
        try
        {
            var failure = Assert.Throws<TargetInvocationException>(() => ReplaceFiles(source, install, "missing.exe"));

            Assert.IsType<FileNotFoundException>(failure.InnerException);
            Assert.False(Directory.Exists(install));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }

    private static void ReplaceFiles(string source, string install, params string[] files)
    {
        var assembly = Assembly.Load("OrithosHardwareConnect");
        var type = assembly.GetType("Orithos.HardwareConnect.InstallFileTransaction", throwOnError: true)!;
        var method = type.GetMethod("ReplaceFiles", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        method.Invoke(null, [source, install, files]);
    }

    private static void ReplaceFilesAndVerify(
        string source,
        string install,
        string[] files,
        Action verify,
        Action beforeRollback,
        Action? afterRollback = null)
    {
        var assembly = Assembly.Load("OrithosHardwareConnect");
        var type = assembly.GetType("Orithos.HardwareConnect.InstallFileTransaction", throwOnError: true)!;
        var method = type.GetMethod("ReplaceFilesAndVerify", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;
        method.Invoke(null, [source, install, files, verify, beforeRollback, afterRollback]);
    }

    private static void WithDirectories(Action<string, string> action)
    {
        var root = Path.Combine(Path.GetTempPath(), $"orithos-hc-install-test-{Guid.NewGuid():N}");
        var source = Path.Combine(root, "source");
        var install = Path.Combine(root, "install");
        Directory.CreateDirectory(source);
        Directory.CreateDirectory(install);
        try
        {
            action(source, install);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static void Write(string root, string relativePath, string content)
    {
        var path = Path.Combine(root, relativePath.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, content);
    }

    private static string Read(string root, string relativePath)
    {
        return File.ReadAllText(Path.Combine(root, relativePath.Replace('/', Path.DirectorySeparatorChar)));
    }
}
