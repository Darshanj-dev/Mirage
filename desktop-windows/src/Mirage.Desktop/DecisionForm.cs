// The decision window: shown only when MIRAGE has held a send. Leads with the risk and the one
// sentence that matters ("Your information has NOT been sent yet."), true because the key press
// or click really was held. Values are never shown in full.
using Mirage.Core;

namespace Mirage.Desktop;

internal sealed class DecisionForm : Form
{
    private readonly ProtectionController _controller;
    private readonly Decision _decision;
    private readonly FlowLayoutPanel _items = new() { FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink };
    private readonly Label _why = new() { AutoSize = true, MaximumSize = new Size(440, 0), Visible = false };
    private readonly Label _status = new() { AutoSize = true, MaximumSize = new Size(440, 0), Visible = false, ForeColor = Color.FromArgb(217, 119, 6) };
    private readonly Button _protect = new() { Text = "Protect && Send", AutoSize = true, Padding = new Padding(8, 2, 8, 2) };
    private readonly Button _review = new() { Text = "Review", AutoSize = true };
    private readonly Button _cancel = new() { Text = "Cancel", AutoSize = true };
    private readonly LinkLabel _anyway = new() { Text = "Send anyway", AutoSize = true };
    private bool _reviewing;

    protected override bool ShowWithoutActivation => false;

    public DecisionForm(ProtectionController controller, Decision decision)
    {
        _controller = controller;
        _decision = decision;
        Text = "MIRAGE";
        Icon = Theme.Shield(Names.LevelColor(decision.Analysis.Risk.Level));
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = MinimizeBox = false;
        ShowInTaskbar = false;
        TopMost = true;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        BackColor = Theme.Paper;
        ForeColor = Theme.Ink;
        Font = Theme.Body;
        Padding = new Padding(18);
        StartPosition = FormStartPosition.Manual;

        var root = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink };
        var bar = new Panel { Height = 4, Width = 440, BackColor = Names.LevelColor(decision.Analysis.Risk.Level), Margin = new Padding(0, 0, 0, 10) };
        root.Controls.Add(bar);

        var head = new TableLayoutPanel { ColumnCount = 2, AutoSize = true, Width = 440 };
        head.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 360));
        head.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 80));
        var titles = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, WrapContents = false };
        titles.Controls.Add(new Label { Text = "MIRAGE", Font = Theme.Small, ForeColor = Theme.Muted, AutoSize = true });
        titles.Controls.Add(new Label { Text = decision.Unreadable ? "MIRAGE couldn't check this message" : Names.LevelTitle(decision.Analysis.Risk.Level), Font = Theme.Title, AutoSize = true });
        titles.Controls.Add(new Label { Text = "✋ Your information has NOT been sent yet.", AutoSize = true, Font = new Font(Theme.Body, FontStyle.Bold), Margin = new Padding(3, 4, 3, 0) });
        head.Controls.Add(titles, 0, 0);
        if (!decision.Unreadable)
        {
            var score = new Label { Text = decision.Analysis.Risk.Score.ToString(), Font = Theme.Score, ForeColor = Names.LevelColor(decision.Analysis.Risk.Level), AutoSize = true, Anchor = AnchorStyles.Right };
            var box = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, Anchor = AnchorStyles.Right };
            box.Controls.Add(score);
            box.Controls.Add(new Label { Text = "/ 100 risk", Font = Theme.Small, ForeColor = Theme.Muted, AutoSize = true });
            head.Controls.Add(box, 1, 0);
        }
        root.Controls.Add(head);

        if (decision.Unreadable)
        {
            root.Controls.Add(new Label { Text = $"{decision.Adapter.DisplayName}'s message box didn't answer, so MIRAGE couldn't check it. Your message is still in the box.", AutoSize = true, MaximumSize = new Size(440, 0), ForeColor = Theme.Muted, Margin = new Padding(3, 10, 3, 10) });
        }
        else
        {
            var n = decision.Analysis.Actionable.Count();
            var secrets = decision.Analysis.Actionable.Count(f => f.Policy == "block");
            var summary = $"We found {n} sensitive item{(n == 1 ? "" : "s")}. " + (secrets > 0
                ? $"Protect & Send removes secrets and replaces personal details with placeholders before {decision.Adapter.DisplayName} sees the message."
                : $"Protect & Send replaces them with placeholders before {decision.Adapter.DisplayName} sees the message.");
            root.Controls.Add(new Label { Text = summary, AutoSize = true, MaximumSize = new Size(440, 0), ForeColor = Theme.Muted, Margin = new Padding(3, 10, 3, 8) });
            root.Controls.Add(_items);
            _why.Text = $"Why {decision.Analysis.Risk.Score}? " + string.Join(" · ", decision.Analysis.Risk.Lines.Select(l => $"{Names.Line(l)} +{l.Points}"));
            _why.ForeColor = Theme.Muted;
            _why.Font = Theme.Small;
            root.Controls.Add(_why);
            BuildItems();
        }
        root.Controls.Add(_status);

        var buttons = new FlowLayoutPanel { FlowDirection = FlowDirection.LeftToRight, AutoSize = true, Margin = new Padding(0, 12, 0, 0) };
        _cancel.Click += (_, _) => { _controller.Cancel(); };
        _review.Click += (_, _) => { _reviewing = !_reviewing; _review.Text = _reviewing ? "Hide details" : "Review"; _why.Visible = _reviewing; BuildItems(); };
        _protect.Click += (_, _) => _controller.ProtectAndSend(Busy);
        _anyway.LinkClicked += (_, _) => SendAnyway();
        buttons.Controls.Add(_cancel);
        if (!decision.Unreadable) { buttons.Controls.Add(_review); }
        buttons.Controls.Add(_anyway);
        if (!decision.Unreadable) buttons.Controls.Add(_protect);
        root.Controls.Add(buttons);
        Controls.Add(root);

        AcceptButton = decision.Unreadable ? _cancel : _protect;
        CancelButton = _cancel;
        FormClosing += (_, e) => { if (e.CloseReason == CloseReason.UserClosing && _controller.Current == _decision) _controller.Cancel(); };
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        // Bottom-centre of the screen with the AI app, above the taskbar: where the prompt box is.
        var screen = Screen.FromHandle(_decision.Window).WorkingArea;
        Location = new Point(screen.Left + (screen.Width - Width) / 2, screen.Bottom - Height - 140);
        Activate();
    }

    private void BuildItems()
    {
        _items.SuspendLayout();
        _items.Controls.Clear();
        var findings = _decision.Analysis.Findings;
        for (var i = 0; i < findings.Count; i++)
        {
            var f = findings[i];
            var index = i;
            var row = new TableLayoutPanel { ColumnCount = 3, AutoSize = true, Width = 440, BackColor = Theme.Sunk, Margin = new Padding(0, 0, 0, 2), Padding = new Padding(6, 4, 6, 4) };
            row.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 290));
            row.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 70));
            row.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 70));
            var kept = _decision.Keep.Contains(index);
            var name = Names.Finding(f) + (kept ? "  (sent as typed)" : "");
            var detail = _reviewing ? $"\n{f.Redacted}   {Names.Reason(f)} · {Math.Round(f.Confidence * 100)}% sure" : "";
            row.Controls.Add(new Label { Text = name + detail, AutoSize = true, MaximumSize = new Size(285, 0) }, 0, 0);
            row.Controls.Add(new Label { Text = f.Severity.ToUpperInvariant(), ForeColor = Names.SeverityColor(f.Severity), Font = new Font(Theme.Small, FontStyle.Bold), AutoSize = true }, 1, 0);
            if (_reviewing && f.IsActionable)
            {
                var box = new CheckBox { Text = f.Policy == "block" ? "Remove" : "Hide", Checked = !kept, AutoSize = true };
                box.CheckedChanged += (_, _) => { if (box.Checked) _decision.Keep.Remove(index); else _decision.Keep.Add(index); };
                row.Controls.Add(box, 2, 0);
            }
            else if (!f.IsActionable)
            {
                row.Controls.Add(new Label { Text = "Kept", ForeColor = Theme.Muted, AutoSize = true }, 2, 0);
            }
            _items.Controls.Add(row);
        }
        _items.ResumeLayout();
    }

    private void SendAnyway()
    {
        if (_decision.Analysis.HasCritical || _decision.Unreadable)
        {
            var page = new TaskDialogPage
            {
                Caption = "MIRAGE",
                Heading = _decision.Unreadable ? "Send without checking?" : "This may expose a credential to the AI service.",
                Text = _decision.Unreadable
                    ? "MIRAGE couldn't read this message, so it doesn't know what it contains."
                    : "Anyone who can read this conversation could use it.",
                Buttons = { TaskDialogButton.Cancel },
            };
            var yes = new TaskDialogButton("I Understand — Send");
            page.Buttons.Add(yes);
            page.DefaultButton = TaskDialogButton.Cancel;
            if (TaskDialog.ShowDialog(this, page) != yes) return;
        }
        _controller.SendAnyway();
    }

    private void Busy(bool on)
    {
        _protect.Enabled = _review.Enabled = _cancel.Enabled = !on;
        _anyway.Enabled = !on;
        _protect.Text = on ? "Protecting…" : "Protect && Send";
    }

    public void ShowFailure(string message)
    {
        _status.Text = "⚠ " + message;
        _status.Visible = true;
        _protect.Visible = false;
        _review.Visible = false;
        _anyway.Visible = false;
        _cancel.Text = "Close";
        AcceptButton = _cancel;
    }
}
