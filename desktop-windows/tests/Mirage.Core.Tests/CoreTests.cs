// The same checks as the macOS app's MirageCoreEngineTests: the shared core behaves the same in
// Jint on Windows as in JavaScriptCore on macOS and V8 in the browser.

using System.Diagnostics;
using Mirage.Core;
using Xunit;
using Xunit.Abstractions;

public class CoreTests(ITestOutputHelper output)
{
    private readonly MirageCoreEngine _core = new();
    private static readonly string AwsId = string.Concat("AKIA", "Q7Z3", "MIRAGEDEMO", "42");
    private static readonly string AwsSecret = string.Concat("mIr4gEDemo", "FakeKey/xQ9", "zT2vLp8wRn5", "kHs3jQQQ");
    private static string Demo => $"Help me debug my production server.\nAWS_ACCESS_KEY_ID={AwsId}\nAWS_SECRET_ACCESS_KEY={AwsSecret}\nMy PAN is BNZPM2501K.\nMy email is priya.demo@example.com.";

    [Fact] public void LoadsTheSharedCore() => Assert.Equal("1.0.0", _core.Version);

    [Fact]
    public void DemoPromptIsCriticalWithExplainedScore()
    {
        var a = _core.Analyze(Demo);
        Assert.Equal("critical", a.Risk.Level);
        Assert.Equal("confirm", a.Action);
        Assert.Equal(new[] { "API_KEY", "API_KEY", "PAN", "EMAIL" }, a.Actionable.Select(f => f.Type));
        Assert.Equal("aws_access_key", a.Actionable.First().Kind);
        Assert.Equal(a.Risk.Score, a.Risk.Lines.Sum(l => l.Points));
    }

    [Fact]
    public void RedactedFormsNeverRevealValues()
    {
        foreach (var f in _core.Analyze(Demo).Findings) Assert.DoesNotContain(f.Value, f.Redacted);
    }

    [Fact]
    public void ProtectRemovesSecretsAndHidesPersonalData()
    {
        var p = _core.Protect(Demo);
        Assert.Contains("«AWS_ACCESS_KEY_REMOVED»", p.Text);
        Assert.Contains("«AWS_SECRET_KEY_REMOVED»", p.Text);
        Assert.Contains("«PAN_1»", p.Text);
        Assert.Contains("«EMAIL_1»", p.Text);
        foreach (var raw in new[] { AwsId, AwsSecret, "BNZPM2501K", "priya.demo@example.com" }) Assert.DoesNotContain(raw, p.Text);
        Assert.Equal(2, p.Removed);
        Assert.Equal(2, p.Hidden);
        Assert.Empty(_core.Analyze(p.Text).Actionable); // a protected prompt checks clean
    }

    [Fact]
    public void SameValueKeepsItsPlaceholderInASession()
    {
        Assert.Contains("«PAN_1»", _core.Protect("PAN BNZPM2501K").Text);
        var b = _core.Protect("again BNZPM2501K and AAACS1234K").Text;
        Assert.Contains("«PAN_1»", b);
        Assert.Contains("«PAN_2»", b);
        _core.ClearSession();
        Assert.Contains("«PAN_1»", _core.Protect("AAACS1234K").Text);
    }

    [Fact]
    public void UnicodeLookAlikesAreStillCaught()
    {
        Assert.Contains(_core.Analyze("PAN ABCDE​1234F").Findings, f => f.Type == "PAN");
        Assert.Contains(_core.Analyze("call 98450 12345").Findings, f => f.Type == "PHONE");
        Assert.Contains(_core.Analyze("Hi, I'm Priya Nair.").Findings, f => f.Type == "NAME");
    }

    [Fact] public void CleanPromptHasNoAction() => Assert.Null(_core.Analyze("Explain photosynthesis in simple words.").Action);

    [Fact]
    public void ReplyCheckFlagsSecretsNotEmails() =>
        Assert.Equal(new[] { "API_KEY" }, _core.CheckReply($"Use key {AwsId} and mail support@example.com").Findings.Select(f => f.Type));

    [Fact]
    public void DetectionIsFastEnoughForAKeyPress()
    {
        _core.Analyze(Demo);
        var sw = Stopwatch.StartNew();
        for (var i = 0; i < 10; i++) _core.Analyze(Demo);
        var ms = sw.Elapsed.TotalMilliseconds / 10;
        output.WriteLine($"MIRAGE core analyze on Jint: {ms:F1} ms per call");
        Assert.True(ms < 150, $"{ms} ms");
    }
}
