// The protection workflow on Windows (same as the macOS app):
//   Return / send click in ChatGPT or Claude → SubmitGate holds it
//   → background: read the prompt box → MIRAGE Core → clean? re-send it (marked) : decision
//   Decision: "Your information has NOT been sent yet." (true: the key/click was held)
//     Protect & Send → protect → bring the app forward → type the protected text → read back
//       (mandatory; else restore the original and say so) → Return → wait for the app to clear
//       the box → only then "Sent protected"
//     Cancel → the prompt is untouched.  Send anyway → critical items need a second confirm.
// Nothing here logs prompt text or values.
using System.Windows;
using System.Windows.Automation;
using Microsoft.Win32;
using Mirage.Core;

namespace Mirage.Desktop;

internal sealed class Decision
{
    public required DesktopAIAdapter Adapter { get; init; }
    public required Analysis Analysis { get; init; }
    public required string Original { get; init; }
    public required AutomationElement? Input { get; init; }
    public required IntPtr Window { get; init; }
    public bool Unreadable { get; init; }
    /// Opened while typing (not by a held send): the window doesn't take the keyboard.
    public bool Early { get; init; }
    /// The prompt box on screen (physical pixels), so the window opens right above it.
    public Rect? Box { get; init; }
    public HashSet<int> Keep { get; } = new();
}

internal enum AppState { Protected, NotRunning, Off, Unavailable }

internal sealed class ProtectionController : IDisposable
{
    private readonly SynchronizationContext _ui;
    private readonly JsonStore<DesktopSettings> _settingsStore = new("settings.json");
    private readonly JsonStore<Stats> _statsStore = new("stats.json");
    private readonly SubmitGate _gate = new();
    private readonly AppMonitor _monitor = new();
    private (DesktopAIAdapter Adapter, FrontApp App)? _front;
    private AutomationElement? _lastInput;
    private Rect? _inputRect, _sendRect;
    private AutomationFocusChangedEventHandler? _focusHandler;
    // Review while typing: the prompt box is read a few times a second while ChatGPT or Claude is
    // in front (that box only; nothing else, and nothing is kept after it is analysed).
    private readonly System.Windows.Forms.Timer _poll = new() { Interval = 120 }; // a pause of 0.12-0.24 s opens the review (same as macOS)
    private volatile bool _polling;
    private string? _pollText;
    private Analysis? _pollAnalysis;
    private readonly HashSet<string> _earlyShown = new(); // memory only, never logged

    public DesktopSettings Settings { get; private set; }
    public Stats Stats { get; }
    public MirageCoreEngine? Core { get; private set; }
    public string CoreStatus { get; private set; } = "Starting";
    public Decision? Current { get; private set; }
    public bool SettingsRecovered => _settingsStore.RecoveredFromDamage;
    public double LastCheckMs { get; private set; }

    public event Action? Changed;
    public event Action<Decision>? DecisionOpened;
    public event Action? DecisionClosed;
    public event Action<string, bool>? Toast; // text, success
    public event Action<string>? DecisionFailed;

    public ProtectionController(SynchronizationContext ui)
    {
        _ui = ui;
        Settings = _settingsStore.Load();
        Stats = _statsStore.Load();
    }

    public void Start()
    {
        try { Core = new MirageCoreEngine(); CoreStatus = "Running"; }
        catch { Core = null; CoreStatus = "Failed to load"; }
        // Warm the detector up now, so the first check isn't the slow one (the JavaScript engine
        // compiles on first use).
        if (Core is { } warm) Task.Run(() => { try { warm.Analyze("Warm-up: PAN ABCDE1234F, mail demo@example.com, 9876543210"); } catch { } });
        _poll.Tick += (_, _) => Poll();
        _poll.Start();
        _gate.OnHold = OnHold;
        _gate.ShouldHoldClick = ShouldHoldClick;
        _gate.Install();
        _monitor.Changed += app => _ui.Post(_ => FrontChanged(app), null);
        _monitor.Start();
        SystemEvents.PowerModeChanged += (_, e) => { if (e.Mode == PowerModes.Resume) _ui.Post(_ => Recover(), null); };
    }

    /// After sleep/wake: re-install the hooks, forget cached elements, re-read the front app.
    public void Recover()
    {
        _gate.Dispose();
        _gate.Install();
        _lastInput = null; _inputRect = null; _sendRect = null;
        FrontChanged(AppMonitor.Current());
    }

    // ---------------------------------------------------------------- front app

    private void FrontChanged(FrontApp? app)
    {
        var adapter = AdapterRegistry.ForProcess(app?.ProcessName);
        if (adapter == null || app == null || !Settings.ProtectionOn || !Settings.AppEnabled(adapter.Id) || Core == null)
        {
            // MIRAGE's own decision window in front keeps the gate as it is; anything else disarms it.
            if (app == null || app.Pid != Environment.ProcessId) { _front = null; _gate.Armed = false; StopFocusWatch(); }
            Changed?.Invoke();
            return;
        }
        if (_front?.App.Pid != app.Pid) { _lastInput = null; _inputRect = null; _sendRect = null; }
        _front = (adapter, app);
        _gate.Armed = _gate.Installed;
        StartFocusWatch(app.Pid, adapter);
        Changed?.Invoke();
    }

    /// While a protected app is in front: remember its prompt box and send button when focus
    /// moves inside it (events for other apps are ignored at once and never inspected).
    private void StartFocusWatch(int pid, DesktopAIAdapter adapter)
    {
        StopFocusWatch();
        _focusHandler = (sender, _) =>
        {
            if (sender is not AutomationElement el || Uia.ProcessId(el) != pid || !adapter.IsInput(el)) return;
            _lastInput = el;
            _inputRect = Uia.Bounds(el);
            var send = adapter.SendControl(el);
            if (send != null) _sendRect = Uia.Bounds(send);
        };
        Task.Run(() => { try { Automation.AddAutomationFocusChangedEventHandler(_focusHandler); } catch { } });
    }

    private void StopFocusWatch()
    {
        var h = _focusHandler;
        _focusHandler = null;
        if (h != null) Task.Run(() => { try { Automation.RemoveAutomationFocusChangedEventHandler(h); } catch { } });
    }

    public IEnumerable<(DesktopAIAdapter Adapter, AppState State)> Apps() =>
        AdapterRegistry.All.Select(a => (a,
            Core == null ? AppState.Unavailable
            : !Settings.ProtectionOn || !Settings.AppEnabled(a.Id) ? AppState.Off
            : !AppMonitor.IsRunning(a.ProcessNames) ? AppState.NotRunning
            : AppState.Protected));

    // ---------------------------------------------------------------- the gate

    /// Clicks on the send button, or near the prompt box (not inside it), are held and checked.
    private bool ShouldHoldClick(int x, int y)
    {
        if (Native.IsOwnWindowAt(x, y)) return false; // MIRAGE's own window: its buttons must work
        var p = new System.Windows.Point(x, y);
        if (_sendRect is { } s && Inflate(s, 4).Contains(p)) return true;
        if (_inputRect is { } i && !i.Contains(p) && Inflate(i, 150).Contains(p)) return true;
        return false;
    }

    private static Rect Inflate(Rect r, double by) { r.Inflate(by, by); return r; }

    private void OnHold(Trigger trigger, int x, int y)
    {
        if (_front is not { } front || Core is not { } core) { Replay(trigger, x, y); return; }
        _gate.DecisionOpen = true; // hold anything else until this one is decided
        var settings = Settings;
        Task.Run(() =>
        {
            var started = DateTime.UtcNow;
            try
            {
                AutomationElement? input;
                if (trigger == Trigger.Return)
                {
                    // The box the user is typing in; if focus is reported on something else inside
                    // the app, the last prompt box, then a search: never let a Return through unchecked.
                    var focused = Uia.Focused();
                    if (focused != null && Uia.ProcessId(focused) == front.App.Pid && front.Adapter.IsInput(focused)) input = focused;
                    else input = _lastInput ?? Uia.FindInput(front.App.Window, front.Adapter);
                    if (input == null && focused != null && Uia.ProcessId(focused) == front.App.Pid) { Pass(trigger, x, y); return; } // no prompt box in this window
                }
                else
                {
                    if (!IsSendClick(front.Adapter, front.App.Pid, x, y)) { Pass(trigger, x, y); return; }
                    input = _lastInput;
                }
                var text = input == null ? null : front.Adapter.Read(input);
                if (input == null || text == null) { Open(front, Analysis.Empty, text ?? "", input, unreadable: true); return; }
                _lastInput = input;
                var analysis = core.Analyze(text, settings.Detection, settings.Policy);
                LastCheckMs = (DateTime.UtcNow - started).TotalMilliseconds;
                if (!analysis.Actionable.Any())
                {
                    Record(new Counts { Checked = 1 });
                    Pass(trigger, x, y);
                    return;
                }
                Record(new Counts { Checked = 1, Held = 1 });
                Open(front, analysis, text, input, unreadable: false);
            }
            catch
            {
                Open(front, Analysis.Empty, "", _lastInput, unreadable: true); // fail closed
            }
        });
    }

    private bool IsSendClick(DesktopAIAdapter adapter, int pid, int x, int y)
    {
        if (_sendRect is { } s && Inflate(s, 4).Contains(new System.Windows.Point(x, y))) return true;
        var el = Uia.At(x, y);
        for (var i = 0; i < 4 && el != null; i++)
        {
            if (Uia.ProcessId(el) != pid) return false;
            if (adapter.IsSendControl(el)) { _sendRect = Uia.Bounds(el); return true; }
            el = Uia.Parent(el);
        }
        return false;
    }

    /// Nothing to hide (or not a send): let the user's key press or click go on, as it was.
    private void Pass(Trigger trigger, int x, int y) => _ui.Post(_ => { _gate.DecisionOpen = false; Replay(trigger, x, y); }, null);

    private static void Replay(Trigger trigger, int x, int y)
    {
        if (trigger == Trigger.Return) KeyPoster.Return(); else KeyPoster.Click(x, y);
    }

    private void Open((DesktopAIAdapter Adapter, FrontApp App) front, Analysis analysis, string text, AutomationElement? input, bool unreadable, bool early = false)
    {
        var d = new Decision { Adapter = front.Adapter, Analysis = analysis, Original = text, Input = input, Window = front.App.Window, Unreadable = unreadable, Early = early, Box = _inputRect };
        _ui.Post(_ =>
        {
            Current = d;
            _gate.DecisionOpen = true;
            DecisionOpened?.Invoke(d);
        }, null);
    }

    // ---------------------------------------------------------------- review while typing

    /// Opens the review as soon as the prompt has something to hide, once typing pauses (like the
    /// extension), not only on Enter. While it is open every Return and send click is held. Once
    /// per set of details: after Cancel it comes back only for something new.
    private void Poll()
    {
        if (_polling || _front is not { } front || Core is not { } core || !Settings.ReviewWhileTyping) return;
        if (Current is { Early: false }) return; // a held send is being decided
        if (Current == null && _gate.DecisionOpen) return; // a held send is being checked
        var known = _lastInput;
        _polling = true;
        var settings = Settings;
        var previous = _pollText;
        Task.Run(() =>
        {
            string? text = null;
            Analysis? analysis = null;
            AutomationElement? input = known;
            try
            {
                // Focus may have been in the box since before MIRAGE started (no focus event yet).
                if (input == null && Uia.Focused() is { } f && Uia.ProcessId(f) == front.App.Pid && front.Adapter.IsInput(f)) input = f;
                if (input == null) { _ui.Post(_ => _polling = false, null); return; }
                text = front.Adapter.Read(input);
                if (text != null && text != previous) analysis = core.Analyze(text, settings.Detection, settings.Policy);
            }
            catch { text = null; }
            _ui.Post(_ => { _polling = false; _lastInput ??= input; Polled(front, input, text, analysis); }, null);
        });
    }

    private void Polled((DesktopAIAdapter Adapter, FrontApp App) front, AutomationElement input, string? text, Analysis? analysis)
    {
        if (_front?.App.Pid != front.App.Pid || text == null) return;
        if (text != _pollText)
        {
            // Still typing: wait for a pause. An open early review follows the prompt.
            _pollText = text;
            _pollAnalysis = analysis;
            var any = analysis != null && analysis.Actionable.Any();
            if (!any) _earlyShown.Clear();
            if (Current is { Early: true } open)
            {
                if (!any) Close();
                else if (!Keys(open.Analysis).SetEquals(Keys(analysis!))) { Current = null; Open(front, analysis!, text, input, unreadable: false, early: true); }
            }
            return;
        }
        if (Current != null || _pollAnalysis is not { } a || !a.Actionable.Any()) return;
        var keys = Keys(a);
        if (keys.IsSubsetOf(_earlyShown)) return;
        _earlyShown.UnionWith(keys);
        Open(front, a, text, input, unreadable: false, early: true);
    }

    private static HashSet<string> Keys(Analysis a) => a.Actionable.Select(f => f.Type + "\u0001" + f.Value).ToHashSet();

    // ---------------------------------------------------------------- decisions

    public void Cancel()
    {
        if (Current == null) return;
        Record(new Counts { Cancelled = 1 });
        Close(); // the prompt is untouched: MIRAGE never wrote to it
    }

    private void Close()
    {
        Current = null;
        _gate.DecisionOpen = false;
        DecisionClosed?.Invoke();
        Changed?.Invoke();
    }

    /// Send the prompt as typed (the decision window asks for confirmation first when needed).
    public void SendAnyway()
    {
        if (Current is not { } d || d.Input == null) { Close(); return; }
        Record(new Counts { SentAnyway = 1 });
        Close();
        Task.Run(() =>
        {
            Native.SetForegroundWindow(d.Window);
            Thread.Sleep(120);
            d.Adapter.Submit(d.Input);
        });
    }

    public void ProtectAndSend(Action<bool> busy)
    {
        if (Current is not { } d || d.Input is not { } input || Core is not { } core) return;
        busy(true);
        var settings = Settings;
        Task.Run(() =>
        {
            string? failure = null;
            Protection? protectedPrompt = null;
            var sent = false;
            try
            {
                var current = d.Adapter.Read(input);
                if (current == null) failure = "MIRAGE couldn't read the message box. Your original message has not been submitted.";
                else if (DesktopAIAdapter.Normalize(current) != DesktopAIAdapter.Normalize(d.Original))
                {
                    // Edited while the window was open: check it again.
                    var fresh = core.Analyze(current, settings.Detection, settings.Policy);
                    _ui.Post(_ => { busy(false); Current = null; Open((d.Adapter, new FrontApp(0, "", d.Window)), fresh, current, input, false); }, null);
                    return;
                }
                else
                {
                    protectedPrompt = core.Protect(d.Original, settings.Detection, d.Keep);
                    Native.SetForegroundWindow(d.Window); // typing reaches the focused window only
                    Thread.Sleep(150);
                    if (d.Adapter.Replace(input, protectedPrompt.Text) != ReplaceResult.Verified)
                    {
                        var restored = d.Adapter.Replace(input, d.Original) == ReplaceResult.Verified;
                        failure = restored
                            ? "Protection could not be verified. Your original message has not been submitted."
                            : "Protection could not be verified. Your message has not been submitted — check the message box before sending.";
                    }
                    else if (!d.Adapter.Submit(input))
                    {
                        failure = "Your message was protected but MIRAGE couldn't send it. It is still in the box, protected.";
                    }
                    else
                    {
                        // Sent means the app took the text out of the box. Until then, claim nothing.
                        var expected = DesktopAIAdapter.Normalize(protectedPrompt.Text);
                        for (var i = 0; i < 30 && !sent; i++)
                        {
                            Thread.Sleep(100);
                            sent = DesktopAIAdapter.Normalize(d.Adapter.Read(input) ?? "") != expected;
                        }
                    }
                }
            }
            catch { failure = "Protection could not be verified. Your original message has not been submitted."; }

            _ui.Post(_ =>
            {
                busy(false);
                if (failure != null) { DecisionFailed?.Invoke(failure); return; }
                if (protectedPrompt == null) return;
                if (sent)
                {
                    var delta = new Counts { ProtectedSends = 1, Masked = protectedPrompt.Hidden, SecretsRemoved = protectedPrompt.Removed };
                    foreach (var f in d.Analysis.Actionable) delta.ByCategory[f.Category] = delta.ByCategory.GetValueOrDefault(f.Category) + 1;
                    Record(delta);
                    Close();
                    Toast?.Invoke($"Sent protected · {protectedPrompt.Hidden} hidden · {protectedPrompt.Removed} removed", true);
                }
                else
                {
                    Close();
                    Toast?.Invoke($"{d.Adapter.DisplayName} didn't send. Your protected message is in the box: press Send.", false);
                }
            }, null);
        });
    }

    // ---------------------------------------------------------------- settings and stats

    public void Update(Action<DesktopSettings> change)
    {
        change(Settings);
        _settingsStore.Save(Settings);
        ApplyStartAtLogin(Settings.StartAtLogin);
        FrontChanged(AppMonitor.Current());
    }

    private static void ApplyStartAtLogin(bool on)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", writable: true);
            if (key == null) return;
            if (on) key.SetValue("MIRAGE", $"\"{Environment.ProcessPath}\"");
            else key.DeleteValue("MIRAGE", throwOnMissingValue: false);
        }
        catch { }
    }

    private void Record(Counts delta)
    {
        lock (Stats) { Stats.Record(delta); _statsStore.Save(Stats); }
        _ui.Post(_ => Changed?.Invoke(), null);
    }

    public void ResetStats()
    {
        lock (Stats) { Stats.Today = new Counts(); Stats.Total = new Counts(); _statsStore.Save(Stats); }
        Changed?.Invoke();
    }

    public void Dispose()
    {
        _poll.Stop();
        StopFocusWatch();
        _gate.Dispose();
        _monitor.Dispose();
    }
}
