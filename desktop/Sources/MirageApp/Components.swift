// Small shared pieces of MIRAGE's native UI. Colour means one thing: risk or status.

import MirageAgent
import MirageCore
import SwiftUI

extension Severity {
    var color: Color {
        switch self { case .critical: .red; case .high: .orange; case .medium: .yellow; case .low: .secondary }
    }
    var label: String { rawValue.uppercased() }
}

extension RiskLevel {
    var color: Color {
        switch self { case .critical: .red; case .high: .orange; case .low: .blue; case .safe: .green }
    }
    var title: String {
        switch self { case .critical: "Critical privacy risk"; case .high: "High privacy risk"; case .low: "Low privacy risk"; case .safe: "No sensitive information" }
    }
}

extension AppProtectionState {
    var text: String {
        switch self {
        case .protecting: "Protected"
        case .beta: "Protected · beta"
        case .notRunning: "Not running"
        case .off: "Off"
        case .needsPermission: "Needs permission"
        case .unsupported: "Unsupported AI application"
        }
    }
    var color: Color {
        switch self {
        case .protecting, .beta: .green
        case .notRunning, .off: .secondary
        case .needsPermission: .orange
        case .unsupported: .secondary
        }
    }
}

struct StatusDot: View {
    let color: Color
    var body: some View {
        Circle().fill(color).frame(width: 8, height: 8)
            .overlay(Circle().stroke(color.opacity(0.25), lineWidth: 3))
            .accessibilityHidden(true)
    }
}

struct StatusRow: View {
    let title: String
    let value: String
    let color: Color
    var body: some View {
        HStack {
            Text(title)
            Spacer()
            StatusDot(color: color)
            Text(value).foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}

struct StatTile: View {
    let value: Int
    let label: String
    var tint: Color = .primary
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)").font(.system(size: 26, weight: .semibold, design: .rounded)).monospacedDigit().foregroundStyle(value > 0 ? tint : .primary)
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
        .accessibilityElement(children: .combine)
    }
}

struct SeverityBadge: View {
    let severity: Severity
    var body: some View {
        Text(severity.label)
            .font(.system(size: 10, weight: .bold)).tracking(0.5)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .foregroundStyle(severity == .low ? Color.secondary : severity.color)
            .background(severity.color.opacity(0.14), in: RoundedRectangle(cornerRadius: 4))
    }
}

struct ShieldMark: View {
    var color: Color = .accentColor
    var size: CGFloat = 20
    var body: some View {
        Image(systemName: "shield.lefthalf.filled").font(.system(size: size, weight: .semibold)).foregroundStyle(color)
    }
}

/// Readable names for finding types and secret kinds (same words as the extension).
enum Names {
    static func finding(_ f: Finding) -> String {
        if let k = f.kind, let n = kinds[k] { return n }
        return types[f.type] ?? f.type
    }
    static let types: [String: String] = [
        "AADHAAR": "Aadhaar number", "PAN": "PAN", "PHONE": "Phone number", "EMAIL": "Email", "UPI": "UPI ID", "IFSC": "IFSC code",
        "BANK_ACCOUNT": "Bank account", "ADDRESS": "Address", "PASSPORT": "Passport number", "IP_ADDRESS": "IP address", "DOB": "Date of birth", "NAME": "Name", "CUSTOM": "Always-hide term",
        "HEALTH": "Health detail", "CARD": "Card number", "API_KEY": "API key", "PRIVATE_KEY": "Private key", "PASSWORD": "Password", "OTP": "One-time code",
    ]
    static let kinds: [String: String] = [
        "openai": "OpenAI API key", "anthropic": "Anthropic API key", "aws_access_key": "AWS access key", "aws_secret_key": "AWS secret key",
        "github": "GitHub token", "gitlab": "GitLab token", "google": "Google API key", "google_oauth": "Google OAuth secret", "slack": "Slack token",
        "stripe": "Stripe key", "jwt": "JWT", "bearer": "Access token", "npm": "npm token", "huggingface": "Hugging Face token", "sendgrid": "SendGrid key",
        "twilio": "Twilio key", "webhook": "Webhook URL", "telegram": "Telegram bot token", "env_secret": "Secret value", "high_entropy": "Credential",
        "connection_string": "Database password", "url_credentials": "Password in URL",
    ]
    static let reasons: [String: String] = [
        "checksum": "Check digit is valid", "knownFormat": "Matches a known credential format", "pattern": "Matches the usual format",
        "context": "Named in the text", "assignment": "Assigned to a secret name", "entropy": "Long random-looking string", "custom": "On your Always-hide list",
    ]
    static let riskLines: [String: String] = [
        "COMBO_HEALTH_IDENTITY": "Health detail tied to you", "COMBO_ID_CONTACT": "ID together with contact details",
        "FLOOR_CRITICAL": "Any secret is critical", "FLOOR_HIGH": "Any ID number is at least high",
    ]
    static func riskLine(_ l: RiskLine) -> String { riskLines[l.label] ?? types[l.label] ?? l.label }
    static let categories: [MirageCore.Category: (String, String)] = [
        .identity: ("Personal identity", "Names, Aadhaar, PAN, date of birth"),
        .contact: ("Contact details", "Phone numbers, email addresses"),
        .financial: ("Financial", "Card numbers, bank accounts, UPI IDs, IFSC"),
        .credentials: ("Credentials", "Passwords, one-time codes, private and SSH keys"),
        .apiKeys: ("Developer secrets", "AWS, OpenAI, GitHub, Google, Slack, Stripe, connection strings"),
        .location: ("Network location", "IP addresses"),
        .health: ("Health context", "Lab results and conditions: kept, but they raise the risk score"),
    ]
}
