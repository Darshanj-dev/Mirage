// Application adapters: everything MIRAGE knows about one AI desktop app on Windows. The
// protection workflow is shared; only adapters know an app's structure.
//
// Status on Windows: BETA for both. The adapters follow the structure verified on macOS (same
// web front ends) but have not yet been run against ChatGPT or Claude on Windows. MIRAGE checks
// every step at run time (reads back what it wrote) and never claims a send it didn't see.
using System.Windows.Automation;

namespace Mirage.Desktop;

internal enum AppId { ChatGpt, Claude }

internal enum ReplaceResult { Verified, Mismatch, Failed }

internal abstract class DesktopAIAdapter
{
    public abstract AppId Id { get; }
    public abstract string DisplayName { get; }
    /// Process names (without .exe) of the app's main process.
    public abstract string[] ProcessNames { get; }
    public string Status => "beta";

    protected abstract string[] InputLabels { get; }
    protected virtual string[] SendLabels => new[] { "send", "send message", "send prompt", "submit" };

    /// The prompt box. Any editable text control in the app counts: an unknown label on a new
    /// version must never let a send through unchecked, and checking a clean field only delays
    /// its Return by a moment. The labels only decide which box is preferred when searching.
    public bool IsInput(AutomationElement el) => Uia.IsEditable(el);

    public bool LooksLikeComposer(AutomationElement el) => InputLabels.Any(Uia.Label(el).Contains);

    public bool IsSendControl(AutomationElement el)
    {
        try
        {
            if (el.Current.ControlType != ControlType.Button) return false;
            // Exact labels only: never "Send feedback", never "Stop".
            return SendLabels.Contains(Uia.Label(el));
        }
        catch { return false; }
    }

    /// The send button near the prompt box: climb up to 5 levels, looking at buttons below each.
    public AutomationElement? SendControl(AutomationElement input)
    {
        var scope = Uia.Parent(input);
        for (var level = 0; level < 5 && scope != null; level++)
        {
            var hit = Uia.Buttons(scope).FirstOrDefault(IsSendControl);
            if (hit != null) return hit;
            scope = Uia.Parent(scope);
        }
        return null;
    }

    public string? Read(AutomationElement input) => Uia.Text(input);

    /// Waits until the box stops changing (three equal reads 80 ms apart), then compares.
    public bool Settles(AutomationElement input, string want, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        string? last = null;
        var stable = 0;
        do
        {
            var now = Normalize(Read(input) ?? "");
            if (now == last) stable++; else { stable = 0; last = now; }
            if (stable >= 2) return now == want;
            Thread.Sleep(80);
        } while (DateTime.UtcNow < deadline);
        return false;
    }

    /// Replaces the prompt by typing it (select all, then keyboard input): editors like Electron's
    /// keep their own copy of the text, which only real input updates. Verified by reading back.
    public ReplaceResult Replace(AutomationElement input, string text)
    {
        var want = Normalize(text);
        if (!Uia.Focus(input)) return ReplaceResult.Failed;
        Thread.Sleep(60);
        if (!KeyPoster.SelectAll()) return ReplaceResult.Failed;
        Thread.Sleep(40);
        var ok = want.Length == 0 ? KeyPoster.Backspace() : KeyPoster.Type(text.TrimEnd('\n', '\r'));
        if (!ok) return ReplaceResult.Failed;
        return Settles(input, want, TimeSpan.FromSeconds(2)) ? ReplaceResult.Verified : ReplaceResult.Mismatch;
    }

    /// Sends with Return (marked as MIRAGE's own), with the prompt box focused.
    public bool Submit(AutomationElement input)
    {
        Uia.Focus(input);
        Thread.Sleep(40);
        return KeyPoster.Return();
    }

    public static string Normalize(string s) =>
        s.Replace("\r\n", "\n").Replace('\r', '\n').Replace(' ', ' ').Replace("￼", "").Trim();
}

internal sealed class ChatGptAdapter : DesktopAIAdapter
{
    public override AppId Id => AppId.ChatGpt;
    public override string DisplayName => "ChatGPT";
    public override string[] ProcessNames => new[] { "ChatGPT", "Codex" };
    // macOS 26.924 labels the composer "Do anything"; earlier builds "Ask anything" / "Message ChatGPT".
    protected override string[] InputLabels => new[] { "do anything", "ask anything", "message chatgpt", "ask chatgpt", "prompt" };
}

internal sealed class ClaudeAdapter : DesktopAIAdapter
{
    public override AppId Id => AppId.Claude;
    public override string DisplayName => "Claude";
    public override string[] ProcessNames => new[] { "claude", "Claude" };
    // macOS 2.9939 labels the composer "Prompt"; the web layout "Write your prompt to Claude".
    protected override string[] InputLabels => new[] { "prompt", "reply to claude", "message claude" };
}

internal static class AdapterRegistry
{
    public static readonly DesktopAIAdapter[] All = { new ChatGptAdapter(), new ClaudeAdapter() };

    public static DesktopAIAdapter? ForProcess(string? name) =>
        name == null ? null : All.FirstOrDefault(a => a.ProcessNames.Contains(name, StringComparer.OrdinalIgnoreCase));
}
