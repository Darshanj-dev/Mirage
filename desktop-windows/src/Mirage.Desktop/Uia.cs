// UI Automation (the Windows accessibility API), wrapped so a slow or hung app can never freeze
// MIRAGE: every call runs with a time limit, off the UI thread. Nothing here logs text.
using System.Windows;
using System.Windows.Automation;

namespace Mirage.Desktop;

internal static class Uia
{
    public static readonly TimeSpan Limit = TimeSpan.FromMilliseconds(1500);

    /// Runs `f` on a worker thread; null if it throws or takes longer than the limit.
    public static T? Try<T>(Func<T> f, TimeSpan? limit = null) where T : class
    {
        var task = Task.Run(() => { try { return f(); } catch { return null; } });
        return task.Wait(limit ?? Limit) ? task.Result : null;
    }

    public static AutomationElement? Focused() => Try(() => AutomationElement.FocusedElement);

    public static AutomationElement? At(int x, int y) => Try(() => AutomationElement.FromPoint(new Point(x, y)));

    public static int ProcessId(AutomationElement el) { try { return el.Current.ProcessId; } catch { return -1; } }

    public static string Label(AutomationElement el)
    {
        try { return $"{el.Current.Name} {el.Current.HelpText}".Trim().ToLowerInvariant(); } catch { return ""; }
    }

    public static bool IsEditable(AutomationElement el)
    {
        try
        {
            var type = el.Current.ControlType;
            if (type != ControlType.Edit && type != ControlType.Document) return false;
            if (el.TryGetCurrentPattern(ValuePattern.Pattern, out var vp)) return !((ValuePattern)vp).Current.IsReadOnly;
            return el.TryGetCurrentPattern(TextPattern.Pattern, out _) && el.Current.IsKeyboardFocusable;
        }
        catch { return false; }
    }

    public static string? Text(AutomationElement el)
    {
        return Try(() =>
        {
            if (el.TryGetCurrentPattern(ValuePattern.Pattern, out var vp)) return ((ValuePattern)vp).Current.Value;
            if (el.TryGetCurrentPattern(TextPattern.Pattern, out var tp)) return ((TextPattern)tp).DocumentRange.GetText(-1);
            return null;
        });
    }

    public static Rect? Bounds(AutomationElement el)
    {
        try { var r = el.Current.BoundingRectangle; return r.IsEmpty ? null : r; } catch { return null; }
    }

    public static bool Focus(AutomationElement el) { try { el.SetFocus(); return true; } catch { return false; } }

    public static AutomationElement? Parent(AutomationElement el) => Try(() => TreeWalker.ControlViewWalker.GetParent(el));

    /// Buttons at most `depth` levels below `root`, bounded so a long chat can't stall MIRAGE.
    public static IEnumerable<AutomationElement> Buttons(AutomationElement root, int max = 80)
    {
        var found = Try(() => root.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button)));
        if (found == null) yield break;
        var n = 0;
        foreach (AutomationElement b in found)
        {
            if (++n > max) yield break;
            yield return b;
        }
    }

    /// All text in a window outside `exclude` (the prompt box), newest last, capped.
    public static string WindowText(AutomationElement window, AutomationElement? exclude)
    {
        return Try(() =>
        {
            var texts = window.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Text));
            var parts = new List<string>();
            var n = 0;
            foreach (AutomationElement t in texts)
            {
                if (++n > 6000) break;
                if (exclude != null && IsInside(t, exclude)) continue;
                var name = t.Current.Name;
                if (!string.IsNullOrEmpty(name)) parts.Add(name);
            }
            var joined = string.Join("\n", parts);
            return joined.Length > 20000 ? joined[^20000..] : joined;
        }, TimeSpan.FromSeconds(5)) ?? "";
    }

    private static bool IsInside(AutomationElement el, AutomationElement ancestor)
    {
        var walker = TreeWalker.ControlViewWalker;
        var cur = el;
        for (var i = 0; i < 30 && cur != null; i++)
        {
            if (Automation.Compare(cur, ancestor)) return true;
            cur = walker.GetParent(cur);
        }
        return false;
    }
}
