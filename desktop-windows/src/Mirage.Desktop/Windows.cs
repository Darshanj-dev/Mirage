// The welcome / privacy window and the dashboard. Every number shown is a real local count.
namespace Mirage.Desktop;

internal static class Ui
{
    public static Form Window(string title, int width)
    {
        return new Form
        {
            Text = title,
            Icon = Theme.Shield(Color.FromArgb(37, 99, 235)),
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            StartPosition = FormStartPosition.CenterScreen,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            BackColor = Theme.Paper,
            ForeColor = Theme.Ink,
            Font = Theme.Body,
            Padding = new Padding(24),
            MinimumSize = new Size(width, 0),
        };
    }

    public static FlowLayoutPanel Column() =>
        new() { FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink };

    public static Label Text(string text, Font? font = null, Color? color = null, int width = 520) =>
        new() { Text = text, Font = font ?? Theme.Body, ForeColor = color ?? Theme.Ink, AutoSize = true, MaximumSize = new Size(width, 0), Margin = new Padding(0, 0, 0, 8) };
}

internal sealed class WelcomeForm : Form
{
    public WelcomeForm(ProtectionController controller)
    {
        var f = Ui.Window("Welcome to MIRAGE", 560);
        Text = f.Text; Icon = f.Icon; FormBorderStyle = f.FormBorderStyle; MaximizeBox = false; StartPosition = f.StartPosition;
        AutoSize = true; AutoSizeMode = f.AutoSizeMode; BackColor = f.BackColor; ForeColor = f.ForeColor; Font = f.Font; Padding = f.Padding;
        var col = Ui.Column();
        col.Controls.Add(Ui.Text("MIRAGE", Theme.Small, Theme.Muted));
        col.Controls.Add(Ui.Text("Protect your conversations before sensitive information reaches AI.", Theme.Title));
        col.Controls.Add(Ui.Text("MIRAGE watches the ChatGPT and Claude desktop apps and checks what you are about to send, on this PC. When it finds a secret or personal detail, it stops the send and lets you decide.", color: Theme.Muted));
        col.Controls.Add(Ui.Text("What MIRAGE does on Windows", new Font(Theme.Body, FontStyle.Bold)));
        col.Controls.Add(Ui.Text("• Only while ChatGPT or Claude is in front, it looks at the Return key and clicks near the message box. It never reads other keys and never records anything.\n• It reads the message box of those two apps with Windows UI Automation, the accessibility interface screen readers use.\n• Detection runs on this PC. MIRAGE has no server and makes no network requests.\n• It stores only settings and counts in %APPDATA%\\MIRAGE. Never prompts, passwords, keys or IDs.", width: 520));
        col.Controls.Add(Ui.Text("Beta on Windows: ChatGPT and Claude support follows the structure verified on macOS and has not yet been tested on Windows. MIRAGE checks each step as it runs and never claims a send it didn't see.", Theme.Small, Color.FromArgb(217, 119, 6)));
        var ok = new Button { Text = "Get started", AutoSize = true, Padding = new Padding(10, 2, 10, 2) };
        ok.Click += (_, _) => { controller.Update(s => s.OnboardingDone = true); Close(); };
        col.Controls.Add(ok);
        AcceptButton = ok;
        Controls.Add(col);
    }
}

internal sealed class DashboardForm : Form
{
    private readonly ProtectionController _controller;
    private readonly FlowLayoutPanel _body = Ui.Column();

    public DashboardForm(ProtectionController controller)
    {
        _controller = controller;
        var f = Ui.Window("MIRAGE Dashboard", 520);
        Text = f.Text; Icon = f.Icon; FormBorderStyle = f.FormBorderStyle; MaximizeBox = false; StartPosition = f.StartPosition;
        AutoSize = true; AutoSizeMode = f.AutoSizeMode; BackColor = f.BackColor; ForeColor = f.ForeColor; Font = f.Font; Padding = f.Padding;
        Controls.Add(_body);
        Render();
        controller.Changed += Render;
        FormClosed += (_, _) => controller.Changed -= Render;
    }

    private void Render()
    {
        if (IsDisposed) return;
        _body.SuspendLayout();
        _body.Controls.Clear();
        var c = _controller.Stats.Today;
        _body.Controls.Add(Ui.Text("Protection overview · today", Theme.Title));
        if (c.Checked == 0 && c.Held == 0)
        {
            _body.Controls.Add(Ui.Text("Nothing checked yet. Open ChatGPT or Claude and send a prompt: MIRAGE's counts appear here.", color: Theme.Muted));
        }
        else
        {
            var grid = new TableLayoutPanel { ColumnCount = 2, AutoSize = true };
            void Tile(int value, string label, Color? tint = null)
            {
                var p = Ui.Column();
                p.BackColor = Theme.Sunk;
                p.Padding = new Padding(12);
                p.Margin = new Padding(0, 0, 8, 8);
                p.MinimumSize = new Size(220, 0);
                p.Controls.Add(new Label { Text = value.ToString(), Font = Theme.Score, ForeColor = value > 0 && tint != null ? tint.Value : Theme.Ink, AutoSize = true });
                p.Controls.Add(new Label { Text = label, ForeColor = Theme.Muted, AutoSize = true });
                grid.Controls.Add(p);
            }
            Tile(c.ProtectedSends, "Prompts protected");
            Tile(c.Masked, "Sensitive items masked");
            Tile(c.SecretsRemoved, "Critical risks blocked", Color.FromArgb(220, 38, 38));
            Tile(c.Checked, "Prompts checked");
            _body.Controls.Add(grid);
            if (c.ByCategory.Count > 0)
                _body.Controls.Add(Ui.Text("Categories: " + string.Join(" · ", c.ByCategory.Select(kv => $"{kv.Key} {kv.Value}")), color: Theme.Muted));
        }
        _body.Controls.Add(Ui.Text($"All time: {_controller.Stats.Total.ProtectedSends} protected · {_controller.Stats.Total.SecretsRemoved} risks blocked", color: Theme.Muted));
        _body.Controls.Add(Ui.Text("Counts only. MIRAGE never stores what you typed.", Theme.Small, Theme.Muted));
        var reset = new LinkLabel { Text = "Reset statistics", AutoSize = true };
        reset.LinkClicked += (_, _) => _controller.ResetStats();
        _body.Controls.Add(reset);
        _body.ResumeLayout();
    }
}
