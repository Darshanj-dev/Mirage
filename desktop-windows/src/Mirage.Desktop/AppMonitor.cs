// Which app is in front, event-driven (EVENT_SYSTEM_FOREGROUND). Only "is it a protected AI app"
// is kept; nothing about other apps is inspected or stored.
using System.Diagnostics;
using static Mirage.Desktop.Native;

namespace Mirage.Desktop;

internal sealed record FrontApp(int Pid, string ProcessName, IntPtr Window);

internal sealed class AppMonitor : IDisposable
{
    private readonly WinEventProc _proc;
    private IntPtr _hook;
    public event Action<FrontApp?>? Changed;

    public AppMonitor() { _proc = OnForeground; }

    public void Start()
    {
        _hook = SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, IntPtr.Zero, _proc, 0, 0, WINEVENT_OUTOFCONTEXT);
        Changed?.Invoke(Current());
    }

    public static FrontApp? Current() => Describe(GetForegroundWindow());

    private static FrontApp? Describe(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return null;
        GetWindowThreadProcessId(hwnd, out var pid);
        try { return new FrontApp((int)pid, Process.GetProcessById((int)pid).ProcessName, hwnd); }
        catch { return null; }
    }

    private void OnForeground(IntPtr hook, uint evt, IntPtr hwnd, int idObject, int idChild, uint thread, uint time) => Changed?.Invoke(Describe(hwnd));

    public static bool IsRunning(IEnumerable<string> processNames) =>
        processNames.Any(n => Process.GetProcessesByName(n).Length > 0);

    public void Dispose() { if (_hook != IntPtr.Zero) UnhookWinEvent(_hook); _hook = IntPtr.Zero; }
}
