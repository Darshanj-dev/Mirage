// The submit gate, Windows edition: low-level keyboard and mouse hooks, active only while a
// protected AI app is in front.
//
// Windows skips a low-level hook that takes too long (and may drop it), which would let a send
// through unchecked. So the hook never checks anything itself: while a protected app is in
// front, it HOLDS every Return (and every click near the prompt box) at once and hands it to the
// controller, which checks in the background and re-sends it (marked as MIRAGE's own) if the
// prompt is clean. Not a keylogger: only Return and left clicks are looked at; nothing is stored.
using System.Runtime.InteropServices;
using static Mirage.Desktop.Native;

namespace Mirage.Desktop;

internal enum Trigger { Return, Click }

internal sealed class SubmitGate : IDisposable
{
    private readonly HookProc _keyboardProc, _mouseProc; // kept alive: the OS holds raw pointers
    private IntPtr _keyboardHook, _mouseHook;
    private bool _swallowNextUp;

    /// True while a protected app is in front and protection is on.
    public volatile bool Armed;
    /// Held sends go here (on the UI thread, after the hook returns).
    public Action<Trigger, int, int>? OnHold;
    /// Whether a click at this point should be held (near the prompt box / on the send button).
    public Func<int, int, bool> ShouldHoldClick = (_, _) => false;
    /// While a decision is open, every Return and send click in the app is held.
    public volatile bool DecisionOpen;

    public SubmitGate()
    {
        _keyboardProc = KeyboardHook;
        _mouseProc = MouseHook;
    }

    public void Install()
    {
        var module = GetModuleHandle(null);
        if (_keyboardHook == IntPtr.Zero) _keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, _keyboardProc, module, 0);
        if (_mouseHook == IntPtr.Zero) _mouseHook = SetWindowsHookEx(WH_MOUSE_LL, _mouseProc, module, 0);
    }

    public bool Installed => _keyboardHook != IntPtr.Zero && _mouseHook != IntPtr.Zero;

    private IntPtr KeyboardHook(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0 && Armed && (int)wParam is WM_KEYDOWN or WM_SYSKEYDOWN)
        {
            var k = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
            if (k.dwExtraInfo != KeyPoster.Marker && k.vkCode == VK_RETURN && !OwnWindowInFront() && !IsDown(VK_SHIFT) && !IsDown(VK_CONTROL) && !IsDown(VK_MENU))
            {
                if (!DecisionOpen) SynchronizationContext.Current?.Post(_ => OnHold?.Invoke(Trigger.Return, 0, 0), null);
                return (IntPtr)1; // held: the app never sees it
            }
        }
        return CallNextHookEx(_keyboardHook, nCode, wParam, lParam);
    }

    private IntPtr MouseHook(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0 && Armed)
        {
            var m = Marshal.PtrToStructure<MSLLHOOKSTRUCT>(lParam);
            if (m.dwExtraInfo != KeyPoster.Marker)
            {
                if ((int)wParam == WM_LBUTTONDOWN && ShouldHoldClick(m.pt.X, m.pt.Y))
                {
                    _swallowNextUp = true;
                    if (!DecisionOpen) SynchronizationContext.Current?.Post(_ => OnHold?.Invoke(Trigger.Click, m.pt.X, m.pt.Y), null);
                    return (IntPtr)1;
                }
                if ((int)wParam == WM_LBUTTONUP && _swallowNextUp)
                {
                    _swallowNextUp = false;
                    return (IntPtr)1;
                }
            }
        }
        return CallNextHookEx(_mouseHook, nCode, wParam, lParam);
    }

    public void Dispose()
    {
        if (_keyboardHook != IntPtr.Zero) UnhookWindowsHookEx(_keyboardHook);
        if (_mouseHook != IntPtr.Zero) UnhookWindowsHookEx(_mouseHook);
        _keyboardHook = _mouseHook = IntPtr.Zero;
    }
}
