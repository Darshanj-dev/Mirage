// Light/dark following Windows, and the shield icon drawn at run time (no image files needed).
using System.Drawing.Drawing2D;
using Microsoft.Win32;

namespace Mirage.Desktop;

internal static class Theme
{
    public static bool Dark
    {
        get
        {
            try
            {
                using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
                return key?.GetValue("AppsUseLightTheme") is int v && v == 0;
            }
            catch { return false; }
        }
    }

    public static Color Paper => Dark ? Color.FromArgb(28, 29, 32) : Color.White;
    public static Color Ink => Dark ? Color.FromArgb(229, 231, 235) : Color.FromArgb(15, 23, 42);
    public static Color Muted => Dark ? Color.FromArgb(156, 163, 175) : Color.FromArgb(100, 116, 139);
    public static Color Sunk => Dark ? Color.FromArgb(38, 40, 44) : Color.FromArgb(241, 245, 249);
    public static readonly Font Body = new("Segoe UI", 9.75f);
    public static readonly Font Title = new("Segoe UI Semibold", 12.5f);
    public static readonly Font Small = new("Segoe UI", 8.5f);
    public static readonly Font Score = new("Segoe UI Semibold", 22f);

    /// The MIRAGE shield, filled with `color`, as a tray/window icon.
    public static Icon Shield(Color color, int size = 32)
    {
        using var bmp = new Bitmap(size, size);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);
            float s = size / 24f;
            var path = new GraphicsPath();
            path.AddLines(new[]
            {
                new PointF(12 * s, 2.5f * s), new PointF(4 * s, 5.5f * s), new PointF(4 * s, 11.5f * s),
                new PointF(6 * s, 17 * s), new PointF(12 * s, 21.5f * s), new PointF(18 * s, 17 * s),
                new PointF(20 * s, 11.5f * s), new PointF(20 * s, 5.5f * s),
            });
            path.CloseFigure();
            using var brush = new SolidBrush(color);
            g.FillPath(brush, path);
        }
        return Icon.FromHandle(bmp.GetHicon());
    }
}
