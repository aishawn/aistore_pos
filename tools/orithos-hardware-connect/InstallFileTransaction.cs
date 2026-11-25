namespace Orithos.HardwareConnect;

internal static class InstallFileTransaction
{
    public static void ReplaceFiles(string sourceRoot, string destinationRoot, IEnumerable<string> relativeFiles)
    {
        sourceRoot = Path.GetFullPath(sourceRoot);
        destinationRoot = Path.GetFullPath(destinationRoot);
        var parentDirectory = Path.GetDirectoryName(destinationRoot)
            ?? throw new ArgumentException("The install directory must have a parent directory.", nameof(destinationRoot));
        Directory.CreateDirectory(parentDirectory);
        Directory.CreateDirectory(destinationRoot);

        var transactionDirectory = Path.Combine(parentDirectory, $".{Path.GetFileName(destinationRoot)}-update-{Guid.NewGuid():N}");
        var backupDirectory = Path.Combine(transactionDirectory, "backup");
        var stageDirectory = Path.Combine(transactionDirectory, "stage");
        Directory.CreateDirectory(backupDirectory);
        Directory.CreateDirectory(stageDirectory);

        var applied = new List<AppliedFile>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var files = relativeFiles
            .Select(relativePath => (RelativePath: NormalizeRelativePath(relativePath), IsAgent: IsAgentExecutable(relativePath)))
            .Where(item => seen.Add(item.RelativePath))
            .OrderBy(item => item.IsAgent)
            .ThenBy(item => item.RelativePath, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        try
        {
            foreach (var file in files)
            {
                var sourcePath = ResolveWithinRoot(sourceRoot, file.RelativePath, nameof(sourceRoot));
                var destinationPath = ResolveWithinRoot(destinationRoot, file.RelativePath, nameof(destinationRoot));
                if (!File.Exists(sourcePath))
                {
                    throw new FileNotFoundException("An install payload file is missing.", sourcePath);
                }

                var backupPath = ResolveWithinRoot(backupDirectory, file.RelativePath, nameof(backupDirectory));
                var stagedPath = ResolveWithinRoot(stageDirectory, file.RelativePath, nameof(stageDirectory));
                Directory.CreateDirectory(Path.GetDirectoryName(destinationPath)!);
                Directory.CreateDirectory(Path.GetDirectoryName(backupPath)!);
                Directory.CreateDirectory(Path.GetDirectoryName(stagedPath)!);

                var existed = File.Exists(destinationPath);
                var attributes = existed ? File.GetAttributes(destinationPath) : FileAttributes.Normal;
                if (existed) File.Copy(destinationPath, backupPath);
                File.Copy(sourcePath, stagedPath);
                File.SetAttributes(stagedPath, FileAttributes.Normal);
                applied.Add(new AppliedFile(file.RelativePath, existed, attributes));
                if (existed) File.SetAttributes(destinationPath, FileAttributes.Normal);
                File.Move(stagedPath, destinationPath, overwrite: true);
            }
        }
        catch (Exception installFailure)
        {
            var rollbackFailures = RollBack(destinationRoot, backupDirectory, applied);
            if (rollbackFailures.Count > 0)
            {
                throw new InstallRollbackException(transactionDirectory, installFailure, rollbackFailures);
            }

            TryDeleteDirectory(transactionDirectory);
            throw;
        }

        TryDeleteDirectory(transactionDirectory);
    }

    private static List<Exception> RollBack(string destinationRoot, string backupDirectory, IReadOnlyList<AppliedFile> applied)
    {
        var failures = new List<Exception>();
        foreach (var file in applied.Reverse())
        {
            try
            {
                var destinationPath = ResolveWithinRoot(destinationRoot, file.RelativePath, nameof(destinationRoot));
                if (!file.Existed)
                {
                    File.Delete(destinationPath);
                    continue;
                }

                var backupPath = ResolveWithinRoot(backupDirectory, file.RelativePath, nameof(backupDirectory));
                var restorePath = $"{destinationPath}.{Guid.NewGuid():N}.rollback";
                File.Copy(backupPath, restorePath);
                File.SetAttributes(restorePath, FileAttributes.Normal);
                if (File.Exists(destinationPath)) File.SetAttributes(destinationPath, FileAttributes.Normal);
                File.Move(restorePath, destinationPath, overwrite: true);
                File.SetAttributes(destinationPath, file.Attributes);
            }
            catch (Exception rollbackFailure)
            {
                failures.Add(rollbackFailure);
            }
        }

        return failures;
    }

    private static string NormalizeRelativePath(string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath) || Path.IsPathRooted(relativePath))
        {
            throw new ArgumentException("Install payload paths must be relative.", nameof(relativePath));
        }

        return relativePath.Replace(Path.AltDirectorySeparatorChar, Path.DirectorySeparatorChar);
    }

    private static string ResolveWithinRoot(string root, string relativePath, string parameterName)
    {
        var fullPath = Path.GetFullPath(Path.Combine(root, relativePath));
        var relative = Path.GetRelativePath(root, fullPath);
        if (relative == ".."
            || relative.StartsWith($"..{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
            || Path.IsPathRooted(relative))
        {
            throw new ArgumentException("Install payload path escapes its root directory.", parameterName);
        }

        return fullPath;
    }

    private static bool IsAgentExecutable(string relativePath)
    {
        return string.Equals(relativePath, "OrithosHardwareConnect.exe", StringComparison.OrdinalIgnoreCase);
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path)) Directory.Delete(path, recursive: true);
        }
        catch
        {
            // Keep the backup directory if cleanup is blocked.
        }
    }

    private sealed record AppliedFile(string RelativePath, bool Existed, FileAttributes Attributes);
}

internal sealed class InstallRollbackException : IOException
{
    public string RecoveryDirectory { get; }

    public InstallRollbackException(string recoveryDirectory, Exception installFailure, IReadOnlyList<Exception> rollbackFailures)
        : base($"The update failed and rollback was incomplete. Recovery files are in: {recoveryDirectory}",
            new AggregateException(installFailure, new AggregateException(rollbackFailures)))
    {
        RecoveryDirectory = recoveryDirectory;
    }
}
