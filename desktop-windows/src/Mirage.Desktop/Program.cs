// MIRAGE desktop companion for Windows. One instance per user; lives in the notification area.
namespace Mirage.Desktop;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        using var single = new Mutex(true, @"Local\MIRAGE.Desktop", out var first);
        if (!first) return; // already running: it is in the notification area
        ApplicationConfiguration.Initialize();
        Application.Run(new TrayApp());
    }
}
