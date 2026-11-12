"""Exercise the real .NET Framework bootstrap with unwritable directories."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile
import hashlib
import struct

ROOT = Path(__file__).resolve().parents[3]
HARNESS = r'''
using System;
using System.IO;
using System.Security.AccessControl;
using System.Security.Principal;

internal static class BootstrapTests {
    public static int Main(string[] args) {
        string root = args[1];
        if (args[0] == "export") {
            try { Bootstrap.ExportPython(args[2], Path.Combine(root, "runtime.zip"), args[3]); return 0; }
            catch (Exception error) { Console.Error.WriteLine(error.Message); return 8; }
        }
        string blocked = Path.Combine(root, "blocked");
        string allowed = Path.Combine(root, "allowed 安装");
        DirectorySecurity original = null;
        try {
            if (args[0] == "file") {
                File.WriteAllText(blocked, "not a directory");
            } else {
                Directory.CreateDirectory(blocked);
                original = Directory.GetAccessControl(blocked);
                DirectorySecurity denied = new DirectorySecurity();
                denied.SetAccessRuleProtection(true, false);
                denied.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User,
                    FileSystemRights.ReadAndExecute, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                    PropagationFlags.None, AccessControlType.Allow));
                Directory.SetAccessControl(blocked, denied);
            }
            if (args[0] == "all-blocked") {
                try { Bootstrap.PreparePayload(new string[] { blocked }); }
                catch (IOException error) {
                    if (error.Message.IndexOf(blocked, StringComparison.OrdinalIgnoreCase) < 0) return 5;
                    return 0;
                }
                return 6;
            }
            string result = Bootstrap.PreparePayload(new string[] { blocked, allowed });
            if (!Path.GetFullPath(result).StartsWith(Path.GetFullPath(allowed) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) return 2;
            if (File.ReadAllText(Path.Combine(result, "Install-Harness.ps1")) != "synthetic installer") return 3;
            Console.WriteLine("payload fallback passed");
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine(error);
            return 1;
        } finally {
            if (original != null) Directory.SetAccessControl(blocked, original);
        }
    }
}
'''


@unittest.skipUnless(os.name == 'nt', 'Windows .NET Framework bootstrap')
class BootstrapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix='Gov bootstrap 编译 ')
        cls.addClassCleanup(cls.temporary.cleanup)
        root = Path(cls.temporary.name)
        harness = root / 'BootstrapTests.cs'; harness.write_text(HARNESS, encoding='utf-8')
        payload = root / 'payload.zip'
        with zipfile.ZipFile(payload, 'w') as archive:
            archive.writestr('Install-Harness.ps1', 'synthetic installer')
        cls.executable = root / 'bootstrap-test.exe'
        compiler = Path(os.environ['WINDIR']) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
        result = subprocess.run([str(compiler), '/nologo', '/codepage:65001', '/target:exe', '/main:BootstrapTests',
            '/reference:System.Windows.Forms.dll', '/reference:System.IO.Compression.dll', '/reference:System.IO.Compression.FileSystem.dll',
            '/resource:' + str(payload) + ',payload.zip', '/out:' + str(cls.executable),
            str(ROOT / 'installer/harness/Bootstrap.cs'), str(harness)], capture_output=True, text=True, errors='replace')
        if result.returncode:
            raise AssertionError(result.stdout + result.stderr)

    def run_case(self, case):
        with tempfile.TemporaryDirectory(prefix='Gov bootstrap fallback ') as temp:
            result = subprocess.run([str(self.executable), case, temp], capture_output=True, text=True, errors='replace', timeout=20)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_unwritable_temp_directory_falls_back_without_elevation(self):
        self.run_case('acl')

    def test_invalid_directory_path_falls_back(self):
        self.run_case('file')

    def test_all_unwritable_paths_report_a_diagnostic(self):
        self.run_case('all-blocked')

    def test_single_file_overlay_is_verified_and_can_be_reused(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); bundle = root / 'bundle.exe'
            core = self.executable.read_bytes(); data = b'synthetic runtime zip'
            expected = hashlib.sha256(data).hexdigest()
            padding = b'\x00' * (-(len(core) + len(data) + 56) % 8)
            footer = struct.pack('<qq32s8s', len(core), len(data), bytes.fromhex(expected), b'GASPY001')
            bundle.write_bytes(core + data + padding + footer)
            command = [str(self.executable), 'export', str(root), str(bundle), expected]
            for _ in range(2):
                result = subprocess.run(command, capture_output=True, text=True, errors='replace', timeout=20)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual((root / 'runtime.zip').read_bytes(), data)
            (root / 'runtime.zip').unlink()
            corrupted = bytearray(bundle.read_bytes()); corrupted[len(core)] ^= 1; bundle.write_bytes(corrupted)
            result = subprocess.run(command, capture_output=True, text=True, errors='replace', timeout=20)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((root / 'runtime.zip').exists())


if __name__ == '__main__':
    unittest.main()
