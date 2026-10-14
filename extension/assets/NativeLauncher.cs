using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;

public static class NativeLauncher {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct Entry {
        public uint size, usage, pid; public IntPtr heap;
        public uint module, threads, parent; public int priority; public uint flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string exe;
    }
    [DllImport("kernel32.dll")] private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool Process32FirstW(IntPtr handle, ref Entry entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool Process32NextW(IntPtr handle, ref Entry entry);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
    private static uint Parent() {
        IntPtr handle = CreateToolhelp32Snapshot(2, 0);
        try {
            Entry entry = new Entry(); entry.size = (uint)Marshal.SizeOf(typeof(Entry));
            uint pid = (uint)Process.GetCurrentProcess().Id;
            if (Process32FirstW(handle, ref entry)) do { if (entry.pid == pid) return entry.parent; } while (Process32NextW(handle, ref entry));
            throw new IOException();
        } finally { CloseHandle(handle); }
    }
    private static string Quote(string value) {
        StringBuilder result = new StringBuilder("\""); int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') result.Append('\\', slashes * 2 + 1);
            else result.Append('\\', slashes);
            slashes = 0; result.Append(c);
        }
        result.Append('\\', slashes * 2); return result.Append('"').ToString();
    }
    private static void Copy(Stream source, Stream target) {
        byte[] buffer = new byte[8192]; int count;
        while ((count = source.Read(buffer, 0, buffer.Length)) > 0) { target.Write(buffer, 0, count); target.Flush(); }
    }
    public static int Main(string[] args) {
        try {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            var config = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(Path.Combine(root, "launch.json")));
            StringBuilder arguments = new StringBuilder(Quote(Path.Combine(root, "shared-proxy.js")));
            foreach (string arg in args) arguments.Append(" ").Append(Quote(arg));
            var start = new ProcessStartInfo((string)config["runtime"], arguments.ToString()) {
                UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true,
                RedirectStandardOutput = true, RedirectStandardError = true
            };
            start.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] = "1";
            start.EnvironmentVariables["ANYDEVICE_OWNER_PID"] = Parent().ToString();
            using (var child = Process.Start(start)) {
                Task.Run(() => { try { Copy(Console.OpenStandardInput(), child.StandardInput.BaseStream); } catch {} finally { try { child.StandardInput.Close(); } catch {} } });
                var output = Task.Run(() => Copy(child.StandardOutput.BaseStream, Console.OpenStandardOutput()));
                var errors = Task.Run(() => Copy(child.StandardError.BaseStream, Console.OpenStandardError()));
                child.WaitForExit(); Task.WaitAll(output, errors); return child.ExitCode;
            }
        } catch { Console.Error.WriteLine("Codex AnyDevice launcher failed."); return 1; }
    }
}
