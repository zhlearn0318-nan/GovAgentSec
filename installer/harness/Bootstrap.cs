using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Windows.Forms;

internal static class Bootstrap {
    private static string Hex(byte[] bytes) { return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant(); }

    // Authenticode appends its certificate after our aligned overlay footer.
    private static long OverlayEnd(FileStream stream) {
        using (BinaryReader reader = new BinaryReader(stream, Encoding.UTF8, true)) {
            stream.Position = 0x3c;
            int pe = reader.ReadInt32();
            if (pe < 0x40 || pe > stream.Length - 160) throw new InvalidDataException("无效的安装器文件。");
            stream.Position = pe;
            if (reader.ReadUInt32() != 0x00004550) throw new InvalidDataException("无效的安装器文件。");
            stream.Position = pe + 24;
            ushort kind = reader.ReadUInt16();
            if (kind != 0x10b && kind != 0x20b) throw new InvalidDataException("无效的安装器文件。");
            stream.Position = pe + 24 + (kind == 0x20b ? 112 : 96) + 32;
            uint certificate = reader.ReadUInt32(), size = reader.ReadUInt32();
            if (certificate == 0 && size == 0) return stream.Length;
            if (certificate < 1024 || size == 0 || (long)certificate + size != stream.Length) throw new InvalidDataException("安装器签名区损坏。");
            return certificate;
        }
    }

    internal static void ExportPython(string executable, string destination, string expectedHash) {
        if (expectedHash == null || expectedHash.Length != 64) throw new InvalidDataException("缺少运行时校验信息。");
        string target = Path.GetFullPath(destination);
        using (FileStream source = File.OpenRead(executable)) {
            long end = OverlayEnd(source);
            if (end < 56) throw new InvalidDataException("安装器未包含 Python 运行时。");
            source.Position = end - 56;
            long offset, length;
            using (BinaryReader reader = new BinaryReader(source, Encoding.UTF8, true)) {
                offset = reader.ReadInt64(); length = reader.ReadInt64();
                string hash = Hex(reader.ReadBytes(32));
                string magic = Encoding.ASCII.GetString(reader.ReadBytes(8));
                if (magic != "GASPY001" || hash != expectedHash || offset < 1024 || length < 1 || offset > end - 56 || length > end - 56 - offset || end - 56 - offset - length > 7)
                    throw new InvalidDataException("安装器运行时缺失或校验信息不匹配，请重新获取完整安装器。");
            }
            if (File.Exists(target)) {
                using (SHA256 hash = SHA256.Create())
                using (Stream existing = File.OpenRead(target)) {
                    if (existing.Length == length && Hex(hash.ComputeHash(existing)) == expectedHash) return;
                }
            }
            Directory.CreateDirectory(Path.GetDirectoryName(target));
            string temporary = target + ".partial-" + Guid.NewGuid().ToString("N");
            try {
                source.Position = offset;
                using (SHA256 hash = SHA256.Create())
                using (Stream output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
                    byte[] buffer = new byte[1024 * 1024];
                    long remaining = length;
                    while (remaining > 0) {
                        int read = source.Read(buffer, 0, (int)Math.Min(buffer.Length, remaining));
                        if (read == 0) throw new EndOfStreamException();
                        output.Write(buffer, 0, read); hash.TransformBlock(buffer, 0, read, null, 0); remaining -= read;
                    }
                    hash.TransformFinalBlock(new byte[0], 0, 0);
                    if (Hex(hash.Hash) != expectedHash) throw new InvalidDataException("安装器运行时校验失败，请重新获取完整安装器。");
                }
                if (File.Exists(target)) File.Delete(target);
                File.Move(temporary, target);
            } finally { if (File.Exists(temporary)) File.Delete(temporary); }
        }
    }

    internal static string PreparePayload(IEnumerable<string> roots) {
        List<string> failures = new List<string>();
        HashSet<string> attempted = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (string root in roots) {
            if (String.IsNullOrWhiteSpace(root)) continue;
            string directory = null;
            try {
                string absolute = Path.GetFullPath(root);
                if (!attempted.Add(absolute)) continue;
                directory = Path.Combine(absolute, "GovAgentSec-Setup-" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(directory);
                string archive = Path.Combine(directory, "payload.zip");
                using (Stream input = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip")) {
                    if (input == null) throw new InvalidOperationException("安装器内置文件缺失，请重新获取安装器。");
                    using (Stream output = File.Create(archive)) { input.CopyTo(output); }
                }
                ZipFile.ExtractToDirectory(archive, directory);
                if (!File.Exists(Path.Combine(directory, "Install-Harness.ps1"))) {
                    throw new InvalidDataException("安装器内置配置不完整。");
                }
                return directory;
            } catch (UnauthorizedAccessException error) {
                failures.Add(root + ": " + error.Message);
            } catch (IOException error) {
                failures.Add(root + ": " + error.Message);
            }
        }
        throw new IOException("未能写入安装缓存目录。请将安装器放在当前用户可写的目录后重试。\n" + String.Join("\n", failures.ToArray()));
    }

    private static string QuoteArgument(string value) {
        int trailing = 0;
        for (int i = value.Length - 1; i >= 0 && value[i] == '\\'; i--) { trailing++; }
        return "\"" + value + new string('\\', trailing) + "\"";
    }
    [STAThread]
    private static int Main(string[] args) {
        Application.EnableVisualStyles();
        bool diagnose = args.Length == 1 && args[0] == "--diagnose";
        bool export = args.Length == 3 && args[0] == "--export-python";
        try {
            if (export) { ExportPython(Assembly.GetExecutingAssembly().Location, args[1], args[2]); return 0; }
            string mediaRoot = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            string directory = PreparePayload(new string[] {
                Path.GetTempPath(),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GovAgentSec", "setup-cache"),
                Path.Combine(mediaRoot, ".govagentsec-setup-cache")
            });
            if (diagnose) { Console.WriteLine("Bootstrap extraction OK: " + directory); return 0; }
            string action = args.Length == 1 && args[0] == "--uninstall" ? "uninstall" : "install";
            ProcessStartInfo start = new ProcessStartInfo();
            start.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe");
            start.Arguments = "-NoProfile -STA -ExecutionPolicy Bypass -File " + QuoteArgument(Path.Combine(directory, "Install-Harness.ps1")) + " -Release " + QuoteArgument(directory) + " -MediaRoot " + QuoteArgument(mediaRoot) + " -BundleExePath " + QuoteArgument(Assembly.GetExecutingAssembly().Location) + " -Action " + action;
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.WorkingDirectory = directory;
            start.RedirectStandardError = true;
            // PowerShell 7's module path is incompatible with Windows PowerShell.
            start.EnvironmentVariables.Remove("PSModulePath");
            using (Process process = Process.Start(start)) {
                string errors = process.StandardError.ReadToEnd();
                process.WaitForExit();
                if (process.ExitCode != 0) {
                    string log = Path.Combine(directory, "launcher-error.txt");
                    File.WriteAllText(log, errors);
                    MessageBox.Show("安装界面启动失败，请查看诊断文件：\n" + log, "GovAgentSec", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
                return process.ExitCode;
            }
        } catch (Exception error) {
            if (diagnose || export) { Console.Error.WriteLine(error); return 1; }
            MessageBox.Show("安装器无法启动：" + error.Message, "GovAgentSec", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
