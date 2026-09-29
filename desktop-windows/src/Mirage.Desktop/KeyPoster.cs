// Input MIRAGE sends itself (re-sending a checked Return or click, typing the protected prompt).
// Every event carries MIRAGE's marker, so the submit gate lets exactly these through.
using static Mirage.Desktop.Native;

namespace Mirage.Desktop;

internal static class KeyPoster
{
    public static readonly UIntPtr Marker = (UIntPtr)0x4D495241; // "MIRA"

    private static INPUT Key(ushort vk, bool up, ushort scan = 0, uint extra = 0) => new()
    {
        type = INPUT_KEYBOARD,
        u = new InputUnion { ki = new KEYBDINPUT { wVk = vk, wScan = scan, dwFlags = (up ? KEYEVENTF_KEYUP : 0) | extra, dwExtraInfo = Marker } },
    };

    private static bool Send(params INPUT[] inputs) =>
        SendInput((uint)inputs.Length, inputs, System.Runtime.InteropServices.Marshal.SizeOf<INPUT>()) == inputs.Length;

    public static bool Return() => Send(Key(VK_RETURN, false), Key(VK_RETURN, true));

    public static bool SelectAll() => Send(Key(VK_CONTROL, false), Key(VK_A, false), Key(VK_A, true), Key(VK_CONTROL, true));

    public static bool Backspace() => Send(Key(VK_BACK, false), Key(VK_BACK, true));

    /// Types text as keyboard input. Line breaks are Shift+Enter, so a multi-line prompt never
    /// sends half-way.
    public static bool Type(string text)
    {
        var lines = text.Replace("\r\n", "\n").Split('\n');
        for (var i = 0; i < lines.Length; i++)
        {
            if (i > 0 && !Send(Key(VK_SHIFT, false), Key(VK_RETURN, false), Key(VK_RETURN, true), Key(VK_SHIFT, true))) return false;
            var inputs = new List<INPUT>();
            foreach (var ch in lines[i])
            {
                inputs.Add(Key(0, false, ch, KEYEVENTF_UNICODE));
                inputs.Add(Key(0, true, ch, KEYEVENTF_UNICODE));
            }
            for (var at = 0; at < inputs.Count; at += 64)
            {
                if (!Send(inputs.Skip(at).Take(64).ToArray())) return false;
                Thread.Sleep(4);
            }
        }
        return true;
    }

    /// A left click at a screen point (physical pixels).
    public static bool Click(int x, int y)
    {
        var vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
        var vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
        var vw = Math.Max(1, GetSystemMetrics(SM_CXVIRTUALSCREEN));
        var vh = Math.Max(1, GetSystemMetrics(SM_CYVIRTUALSCREEN));
        var nx = (int)((x - vx) * 65535L / vw);
        var ny = (int)((y - vy) * 65535L / vh);
        INPUT M(uint flags) => new() { type = INPUT_MOUSE, u = new InputUnion { mi = new MOUSEINPUT { dx = nx, dy = ny, dwFlags = flags | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK, dwExtraInfo = Marker } } };
        return Send(M(MOUSEEVENTF_MOVE), M(MOUSEEVENTF_LEFTDOWN), M(MOUSEEVENTF_LEFTUP));
    }
}
