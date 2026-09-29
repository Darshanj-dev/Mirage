// MIRAGE in the Windows notification area: status at a glance, today's counts, protected apps,
// and the way into everything else. It never shows prompt text or values.
namespace Mirage.Desktop;

internal sealed class TrayApp : ApplicationContext
{
    private readonly ProtectionController _controller;
    private readonly NotifyIcon _tray;
    private DecisionForm? _decisionForm;
    private Form? _dashboard, _welcome;

    public TrayApp()
    {
        var ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
        _controller = new ProtectionController(ui);
        _tray = new NotifyIcon { Text = "MIRAGE", Visible = true, ContextMenuStrip = new ContextMenuStrip() };
        _tray.ContextMenuStrip.Opening += (_, _) => BuildMenu();
        _tray.MouseClick += (_, e) => { if (e.Button == MouseButtons.Left) ShowDashboard(); };

        _controller.Changed += RefreshIcon;
        _controller.DecisionOpened += d =>
        {
            _decisionForm?.Close();
            _decisionForm = new DecisionForm(_controller, d);
            _decisionForm.FormClosed += (_, _) => _decisionForm = null;
            _decisionForm.Show();
        };
        _controller.DecisionClosed += () => { var f = _decisionForm; _decisionForm = null; f?.Close(); };
        _controller.DecisionFailed += message => _decisionForm?.ShowFailure(message);
        _controller.Toast += (text, ok) => _tray.ShowBalloonTip(3000, "MIRAGE", text, ok ? ToolTipIcon.Info : ToolTipIcon.Warning);

        _controller.Start();
        RefreshIcon();
        BuildMenu();
        if (!_controller.Settings.OnboardingDone) ShowWelcome();
        else _tray.ShowBalloonTip(2500, "MIRAGE is running", "Protection is on for ChatGPT and Claude. MIRAGE lives here in the notification area.", ToolTipIcon.Info);
    }

    private void RefreshIcon()
    {
        var on = _controller.Settings.ProtectionOn && _controller.Core != null;
        _tray.Icon = Theme.Shield(on ? Color.FromArgb(22, 163, 74) : Color.Gray, 32);
        _tray.Text = on ? "MIRAGE · Protection active" : "MIRAGE · Protection paused";
    }

    private void BuildMenu()
    {
        var menu = _tray.ContextMenuStrip!;
        menu.Items.Clear();
        var s = _controller.Settings;
        var today = _controller.Stats.Today;
        var status = _controller.Core == null ? "Detection unavailable" : s.ProtectionOn ? "● Protection active" : "○ Protection paused";
        menu.Items.Add(new ToolStripMenuItem("MIRAGE") { Enabled = false, Font = new Font(menu.Font, FontStyle.Bold) });
        menu.Items.Add(new ToolStripMenuItem(status) { Enabled = false });
        menu.Items.Add(new ToolStripMenuItem($"Today: {today.ProtectedSends} protected · {today.SecretsRemoved} risks blocked · {today.Masked} masked") { Enabled = false });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("Protected apps (beta on Windows)") { Enabled = false });
        foreach (var (adapter, state) in _controller.Apps())
        {
            var label = state switch
            {
                AppState.Protected => "protected",
                AppState.NotRunning => "not running",
                AppState.Off => "off",
                _ => "unavailable",
            };
            var item = new ToolStripMenuItem($"{adapter.DisplayName} — {label}") { Checked = s.AppEnabled(adapter.Id), CheckOnClick = false };
            var id = adapter.Id;
            item.Click += (_, _) => _controller.Update(x => x.Apps[id.ToString()] = !x.AppEnabled(id));
            menu.Items.Add(item);
        }
        menu.Items.Add(new ToolStripSeparator());
        var protection = new ToolStripMenuItem("Protection") { Checked = s.ProtectionOn };
        protection.Click += (_, _) => _controller.Update(x => x.ProtectionOn = !x.ProtectionOn);
        menu.Items.Add(protection);
        var early = new ToolStripMenuItem("Review as soon as something sensitive is typed") { Checked = s.ReviewWhileTyping };
        early.Click += (_, _) => _controller.Update(x => x.ReviewWhileTyping = !x.ReviewWhileTyping);
        menu.Items.Add(early);
        var login = new ToolStripMenuItem("Start MIRAGE at sign-in") { Checked = s.StartAtLogin };
        login.Click += (_, _) => _controller.Update(x => x.StartAtLogin = !x.StartAtLogin);
        menu.Items.Add(login);
        menu.Items.Add(new ToolStripMenuItem("Local detection · network not used") { Enabled = false });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Dashboard…", null, (_, _) => ShowDashboard());
        menu.Items.Add("Privacy and security…", null, (_, _) => ShowWelcome());
        menu.Items.Add("Quit MIRAGE", null, (_, _) => Quit());
    }

    private void ShowDashboard()
    {
        if (_dashboard is { IsDisposed: false }) { _dashboard.Activate(); return; }
        _dashboard = new DashboardForm(_controller);
        _dashboard.Show();
    }

    private void ShowWelcome()
    {
        if (_welcome is { IsDisposed: false }) { _welcome.Activate(); return; }
        _welcome = new WelcomeForm(_controller);
        _welcome.Show();
    }

    private void Quit()
    {
        _tray.Visible = false;
        _controller.Dispose();
        ExitThread();
    }
}
