// Readable names for finding types, secret kinds, reasons and risk lines (same words as the
// extension and the macOS app).
using Mirage.Core;

namespace Mirage.Desktop;

internal static class Names
{
    private static readonly Dictionary<string, string> Types = new()
    {
        ["AADHAAR"] = "Aadhaar number", ["PAN"] = "PAN", ["PHONE"] = "Phone number", ["EMAIL"] = "Email", ["UPI"] = "UPI ID",
        ["IFSC"] = "IFSC code", ["BANK_ACCOUNT"] = "Bank account", ["IP_ADDRESS"] = "IP address", ["DOB"] = "Date of birth",
        ["NAME"] = "Name", ["CUSTOM"] = "Always-hide term", ["HEALTH"] = "Health detail", ["CARD"] = "Card number",
        ["API_KEY"] = "API key", ["PRIVATE_KEY"] = "Private key", ["PASSWORD"] = "Password", ["OTP"] = "One-time code",
    };
    private static readonly Dictionary<string, string> Kinds = new()
    {
        ["openai"] = "OpenAI API key", ["anthropic"] = "Anthropic API key", ["aws_access_key"] = "AWS access key",
        ["aws_secret_key"] = "AWS secret key", ["github"] = "GitHub token", ["gitlab"] = "GitLab token", ["google"] = "Google API key",
        ["google_oauth"] = "Google OAuth secret", ["slack"] = "Slack token", ["stripe"] = "Stripe key", ["jwt"] = "JWT",
        ["bearer"] = "Access token", ["npm"] = "npm token", ["huggingface"] = "Hugging Face token", ["sendgrid"] = "SendGrid key",
        ["twilio"] = "Twilio key", ["webhook"] = "Webhook URL", ["telegram"] = "Telegram bot token", ["env_secret"] = "Secret value",
        ["high_entropy"] = "Credential", ["connection_string"] = "Database password", ["url_credentials"] = "Password in URL",
    };
    private static readonly Dictionary<string, string> Reasons = new()
    {
        ["checksum"] = "Check digit is valid", ["knownFormat"] = "Matches a known credential format", ["pattern"] = "Matches the usual format",
        ["context"] = "Named in the text", ["assignment"] = "Assigned to a secret name", ["entropy"] = "Long random-looking string",
        ["custom"] = "On your Always-hide list",
    };
    private static readonly Dictionary<string, string> Lines = new()
    {
        ["COMBO_HEALTH_IDENTITY"] = "Health detail tied to you", ["COMBO_ID_CONTACT"] = "ID together with contact details",
        ["FLOOR_CRITICAL"] = "Any secret is critical", ["FLOOR_HIGH"] = "Any ID number is at least high",
    };

    public static string Finding(Finding f) =>
        f.Kind != null && Kinds.TryGetValue(f.Kind, out var k) ? k : Types.GetValueOrDefault(f.Type, f.Type);
    public static string Reason(Finding f) => Reasons.GetValueOrDefault(f.Reason, f.Reason);
    public static string Line(RiskLine l) => Lines.GetValueOrDefault(l.Label, Types.GetValueOrDefault(l.Label, l.Label));

    public static string LevelTitle(string level) => level switch
    {
        "critical" => "Critical privacy risk",
        "high" => "High privacy risk",
        "low" => "Low privacy risk",
        _ => "No sensitive information",
    };

    public static Color LevelColor(string level) => level switch
    {
        "critical" => Color.FromArgb(220, 38, 38),
        "high" => Color.FromArgb(217, 119, 6),
        "low" => Color.FromArgb(37, 99, 235),
        _ => Color.FromArgb(22, 163, 74),
    };

    public static Color SeverityColor(string severity) => severity switch
    {
        "critical" => Color.FromArgb(220, 38, 38),
        "high" => Color.FromArgb(217, 119, 6),
        "medium" => Color.FromArgb(202, 138, 4),
        _ => Color.Gray,
    };
}
