// MIRAGE desktop companion for Windows. One instance per user; lives in the notification area.
//   MIRAGE.exe --selftest <file>   checks the core, the input hooks and UI Automation, writes the
//                                   results to <file> and exits (used by CI on a Windows machine).
using System.Windows.Automation;
using Mirage.Core;

namespace Mirage.Desktop;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length >= 2 && args[0] == "--selftest") return SelfTest(args[1]);
        using var single = new Mutex(true, @"Local\MIRAGE.Desktop", out var first);
        if (!first) return 0; // already running: it is in the notification area
        ApplicationConfiguration.Initialize();
        Application.Run(new TrayApp());
        return 0;
    }

    private static int SelfTest(string output)
    {
        var lines = new List<string>();
        var ok = true;
        void Check(string name, Func<string> run)
        {
            try { lines.Add($"PASS {name}: {run()}"); }
            catch (Exception e) { ok = false; lines.Add($"FAIL {name}: {e.GetType().Name}"); }
        }
        MirageCoreEngine? core = null;
        Check("core loads", () => { core = new MirageCoreEngine(); return "v" + core.Version; });
        Check("demo prompt is held as critical", () =>
        {
            var key = string.Concat("AKIA", "Q7Z3", "MIRAGEDEMO", "42");
            var sw = System.Diagnostics.Stopwatch.StartNew();
            var a = core!.Analyze($"AWS_ACCESS_KEY_ID={key} My PAN is BNZPM2501K, email priya.demo@example.com");
            if (a.Risk.Level != "critical" || a.Actionable.Count() != 3) throw new InvalidOperationException();
            return $"{a.Risk.Level} {a.Risk.Score}/100, {a.Actionable.Count()} items, {sw.ElapsedMilliseconds} ms";
        });
        Check("protect removes and hides", () =>
        {
            var p = core!.Protect("My PAN is BNZPM2501K");
            if (!p.Text.Contains("«PAN_1»") || p.Text.Contains("BNZPM2501K")) throw new InvalidOperationException();
            return p.Text;
        });
        Check("keyboard and mouse hooks install", () =>
        {
            using var gate = new SubmitGate();
            gate.Install();
            if (!gate.Installed) throw new InvalidOperationException();
            return "installed and removed";
        });
        Check("UI Automation reachable", () => AutomationElement.RootElement.Current.ControlType.ProgrammaticName);
        Check("settings store round-trip", () =>
        {
            var store = new JsonStore<DesktopSettings>("selftest-settings.json");
            store.Save(new DesktopSettings { ProtectionOn = false });
            if (store.Load().ProtectionOn) throw new InvalidOperationException();
            return "ok";
        });
        lines.Add(ok ? "RESULT PASS" : "RESULT FAIL");
        File.WriteAllLines(output, lines);
        return ok ? 0 : 1;
    }
}
