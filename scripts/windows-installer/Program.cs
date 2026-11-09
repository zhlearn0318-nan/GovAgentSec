using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;

[assembly: AssemblyTitle("GovAgentSec Windows Installer")]
[assembly: AssemblyProduct("GovAgentSec v1.0")]
[assembly: AssemblyVersion("1.0.0.0")]

internal static class Program
{
    private static int Main(string[] args)
    {
        try
        {
            byte[] payload;
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Bootstrap.ps1"))
            using (MemoryStream buffer = new MemoryStream())
            {
                if (stream == null) throw new InvalidOperationException("Installer payload is missing.");
                stream.CopyTo(buffer);
                payload = buffer.ToArray();
            }
            // Release validation without downloading, installing or touching user configuration.
            if (args.Length == 1 && args[0] == "--check")
            {
                using (SHA256 hash = SHA256.Create())
                    Console.WriteLine("payload_sha256=" + BitConverter.ToString(hash.ComputeHash(payload)).Replace("-", "").ToLowerInvariant());
                Console.WriteLine("release=v1.0; openclaw=2026.7.1-2; install_started=false");
                return 0;
            }
            if (args.Length != 0) throw new ArgumentException("Supported option: --check");

            Console.OutputEncoding = Encoding.UTF8;
            Console.WriteLine("政安智枢 v1.0 - Windows 安装程序");
            Console.WriteLine("正在下载、校验并安装 OpenClaw 及系统，请保留此窗口。");
            Console.WriteLine("首次 Windows 授权、Docker 设置或重启请按系统提示完成后重新运行。");
            string folder = Path.Combine(Path.GetTempPath(), "GovAgentSec-setup-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(folder);
            string script = Path.Combine(folder, "Bootstrap-Windows.ps1");
            File.WriteAllBytes(script, payload);
            string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe");
            ProcessStartInfo start = new ProcessStartInfo(powershell, "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\"");
            start.UseShellExecute = false;
            int result;
            using (Process child = Process.Start(start))
            {
                child.WaitForExit();
                result = child.ExitCode;
            }
            Console.WriteLine(result == 0 ? "安装完成。以后可使用桌面的 GovAgentSec v1.0 快捷方式。" : "安装未完成。请查看上方错误，处理后重新运行安装程序。");
            Console.WriteLine("按 Enter 关闭窗口。");
            Console.ReadLine();
            return result;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("Installer failed: " + error.Message);
            return 1;
        }
    }
}
