// The decision panel: shown only when MIRAGE has held a send. Leads with the risk and the one
// sentence that matters, which is only shown when the send really was held.

import MirageAgent
import MirageCore
import SwiftUI

struct DecisionView: View {
    @ObservedObject var controller: ProtectionController
    @State private var reviewing = false

    var body: some View {
        if let d = controller.decision {
            content(d)
                .padding(18)
                .frame(width: 440)
                .background(.regularMaterial)
                .overlay(alignment: .top) { Rectangle().fill(d.analysis.risk.level.color).frame(height: 3) }
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    @ViewBuilder
    private func content(_ d: Decision) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            header(d)
            switch d.stage {
            case .confirmSend: confirm(d)
            case .failed(let message): failed(message)
            default:
                if d.unreadable { unreadable(d) } else { review(d) }
            }
        }
    }

    private func header(_ d: Decision) -> some View {
        HStack(alignment: .top, spacing: 10) {
            ShieldMark(color: d.analysis.risk.level.color, size: 22)
            VStack(alignment: .leading, spacing: 3) {
                Text("MIRAGE").font(.caption.weight(.bold)).tracking(1).foregroundStyle(.secondary)
                Text(d.unreadable ? "MIRAGE couldn't check this message" : d.analysis.risk.level.title).font(.headline)
                if d.heldSubmission {
                    Label("Your information has NOT been sent yet.", systemImage: "hand.raised.fill")
                        .font(.subheadline.weight(.medium)).foregroundStyle(.primary)
                }
            }
            Spacer()
            if !d.unreadable {
                VStack(alignment: .trailing, spacing: 0) {
                    Text("\(d.analysis.risk.score)").font(.system(size: 26, weight: .semibold, design: .rounded)).monospacedDigit()
                        .foregroundStyle(d.analysis.risk.level.color)
                    Text("/ 100 risk").font(.caption2).foregroundStyle(.secondary)
                }
                .accessibilityLabel("Privacy risk \(d.analysis.risk.score) out of 100")
            }
        }
    }

    @ViewBuilder
    private func review(_ d: Decision) -> some View {
        let items = Array(d.analysis.findings.enumerated())
        Text(summary(d)).font(.subheadline).foregroundStyle(.secondary)
        VStack(spacing: 0) {
            ForEach(items, id: \.element.id) { i, f in
                row(d, i, f)
                if i < items.count - 1 { Divider() }
            }
        }
        .background(.background.opacity(0.6), in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(.quaternary))

        if reviewing {
            Text("Why \(d.analysis.risk.score)? " + d.analysis.risk.lines.map { "\(Names.riskLine($0)) +\($0.points)" }.joined(separator: " · "))
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }

        HStack {
            Button("Cancel", role: .cancel) { controller.cancel() }.keyboardShortcut(.cancelAction)
            Button(reviewing ? "Hide details" : "Review") { reviewing.toggle() }
            Spacer()
            Button("Send anyway") { controller.sendAnyway(confirmed: false) }.buttonStyle(.link).foregroundStyle(.secondary)
            Button {
                controller.protectAndSend()
            } label: {
                if d.stage == .working { ProgressView().controlSize(.small) } else { Text("Protect & Send") }
            }
            .keyboardShortcut(.defaultAction)
            .disabled(d.stage == .working)
        }
    }

    private func row(_ d: Decision, _ i: Int, _ f: Finding) -> some View {
        let kept = d.keep.contains(i)
        return HStack(alignment: .firstTextBaseline, spacing: 8) {
            Circle().fill(f.severity.color).frame(width: 7, height: 7)
            VStack(alignment: .leading, spacing: 2) {
                Text(Names.finding(f)).font(.callout.weight(.medium)).strikethrough(kept)
                if reviewing {
                    Text(f.redacted).font(.caption.monospaced()).foregroundStyle(.secondary)
                    Text("\(Names.reasons[f.reason] ?? f.reason) · \(Int((f.confidence * 100).rounded()))% sure")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            Spacer()
            SeverityBadge(severity: f.severity)
            if reviewing && f.policy != .warn {
                Toggle(isOn: Binding(get: { !kept }, set: { _ in controller.toggleKeep(i) })) {
                    Text(f.policy == .block ? "Remove" : "Hide")
                }
                .toggleStyle(.checkbox).controlSize(.small)
            } else if f.policy == .warn {
                Text("Kept").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 7)
    }

    private func summary(_ d: Decision) -> String {
        let n = d.analysis.actionable.count
        let secrets = d.analysis.actionable.filter { $0.policy == .block }.count
        var s = "We found \(n) sensitive item\(n == 1 ? "" : "s")."
        if secrets > 0 { s += " Protect & Send removes secrets and replaces personal details with placeholders before \(d.appName) sees the message." }
        else { s += " Protect & Send replaces them with placeholders before \(d.appName) sees the message." }
        return s
    }

    private func confirm(_ d: Decision) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(d.unreadable
                ? "MIRAGE couldn't read this message, so it doesn't know what it contains. Send it as typed?"
                : "This may expose a credential to the AI service. Anyone who can read this conversation could use it.")
                .fixedSize(horizontal: false, vertical: true)
            HStack {
                Spacer()
                Button("Cancel", role: .cancel) { controller.cancel() }.keyboardShortcut(.defaultAction)
                Button("I Understand — Send") { controller.sendAnyway(confirmed: true) }
            }
        }
    }

    private func unreadable(_ d: Decision) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("\(d.appName)'s message box didn't answer, so MIRAGE couldn't check it. Your message is still in the box.")
                .font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            HStack {
                Button("Cancel", role: .cancel) { controller.cancel() }.keyboardShortcut(.defaultAction)
                Spacer()
                Button("Send anyway") { controller.sendAnyway(confirmed: false) }
            }
        }
    }

    private func failed(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(message, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange).fixedSize(horizontal: false, vertical: true)
            HStack { Spacer(); Button("Close") { controller.cancel() }.keyboardShortcut(.defaultAction) }
        }
    }
}

struct ReplyAlertView: View {
    let alert: ReplyAlert
    let onClose: () -> Void
    @State private var reviewing = false
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.shield.fill").foregroundStyle(.orange)
                Text("Sensitive information detected in AI response").font(.headline)
            }
            Text("\(alert.appName)'s reply contains \(alert.analysis.findings.count) secret\(alert.analysis.findings.count == 1 ? "" : "s") or ID number\(alert.analysis.findings.count == 1 ? "" : "s"). MIRAGE didn't change the reply.")
                .font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            if reviewing {
                ForEach(alert.analysis.findings) { f in
                    HStack { Text(Names.finding(f)); Spacer(); Text(f.redacted).font(.caption.monospaced()).foregroundStyle(.secondary); SeverityBadge(severity: f.severity) }
                }
            }
            HStack { Button(reviewing ? "Hide" : "Review") { reviewing.toggle() }; Spacer(); Button("Dismiss", action: onClose).keyboardShortcut(.defaultAction) }
        }
        .padding(16).frame(width: 380).background(.regularMaterial)
        .overlay(alignment: .leading) { Rectangle().fill(.orange).frame(width: 3) }
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

struct ToastView: View {
    let toast: Toast
    var body: some View {
        Label(toast.text, systemImage: toast.success ? "checkmark.shield.fill" : "exclamationmark.triangle.fill")
            .font(.callout.weight(.medium))
            .foregroundStyle(toast.success ? Color.green : Color.orange)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(.regularMaterial, in: Capsule())
    }
}
