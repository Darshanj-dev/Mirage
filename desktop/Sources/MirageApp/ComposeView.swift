// Private Compose for the desktop: write the prompt in MIRAGE's own window, see what will be
// hidden or removed, and insert only the protected version into ChatGPT or Claude. The AI app
// never sees the raw text. The draft lives in this window's memory only and is cleared on insert.

import MirageAgent
import MirageCore
import SwiftUI

struct ComposeView: View {
    @ObservedObject var controller: ProtectionController
    @State private var text = ""
    @State private var analysis = Analysis.empty
    @State private var preview = ""
    @State private var keep: Set<Int> = []
    @State private var target: AppID?
    @State private var targets: [AppRow] = []
    @State private var status: (ok: Bool, text: String)?
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                ShieldMark(size: 20)
                Text("Private Compose").font(.title3.weight(.semibold))
                Spacer()
                if !analysis.actionable.isEmpty || !text.isEmpty {
                    RiskPill(level: analysis.risk.level, score: analysis.risk.score)
                }
            }
            Text("Write here. The AI app never sees this text: MIRAGE types only the protected version into it, and you press Send.")
                .font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)

            TextEditor(text: $text)
                .font(.body)
                .frame(minHeight: 150)
                .padding(6)
                .background(.background, in: RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(.quaternary))
                .onChange(of: text) { _, _ in status = nil; keep = []; refresh() }

            if !analysis.findings.isEmpty {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(Array(analysis.findings.enumerated()), id: \.element.id) { i, f in
                            HStack {
                                Circle().fill(f.severity.color).frame(width: 7, height: 7)
                                Text(Names.finding(f)).strikethrough(keep.contains(i))
                                Text(f.redacted).font(.caption.monospaced()).foregroundStyle(.secondary)
                                Spacer()
                                SeverityBadge(severity: f.severity)
                                if f.policy != .warn {
                                    Toggle(f.policy == .block ? "Remove" : "Hide", isOn: Binding(
                                        get: { !keep.contains(i) },
                                        set: { on in if on { keep.remove(i) } else { keep.insert(i) }; refresh() }
                                    )).toggleStyle(.checkbox).controlSize(.small)
                                } else {
                                    Text("Kept").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            Divider()
                        }
                    }
                }
                .frame(maxHeight: 170)
                .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 8))

                Text("WHAT THE AI WILL SEE").font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(.secondary)
                ScrollView {
                    Text(preview).font(.callout.monospaced()).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 120)
                .padding(8)
                .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 8))
            }

            HStack {
                if targets.isEmpty {
                    Text("Open ChatGPT or Claude to insert.").font(.callout).foregroundStyle(.secondary)
                } else {
                    Picker("Insert into", selection: $target) {
                        ForEach(targets) { Text($0.name).tag(Optional($0.id)) }
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: 240)
                }
                Spacer()
                Button("Clear") { text = ""; status = nil }.disabled(text.isEmpty)
                Button {
                    insert()
                } label: {
                    if busy { ProgressView().controlSize(.small) } else { Text(analysis.actionable.isEmpty ? "Insert" : "Insert protected") }
                }
                .keyboardShortcut(.return, modifiers: .command)
                .buttonStyle(.borderedProminent)
                .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || target == nil || busy)
            }
            if let status {
                Label(status.text, systemImage: status.ok ? "checkmark.shield.fill" : "exclamationmark.triangle.fill")
                    .foregroundStyle(status.ok ? Color.green : Color.orange).font(.callout)
            }
        }
        .padding(18)
        .frame(width: 560)
        .onAppear(perform: loadTargets)
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in loadTargets() }
    }

    private func loadTargets() {
        targets = controller.composeTargets()
        if target == nil || !targets.contains(where: { $0.id == target }) { target = targets.first?.id }
    }

    private func refresh() {
        guard let core = controller.coreEngine, !text.isEmpty else { analysis = .empty; preview = ""; return }
        analysis = (try? core.analyze(text, settings: controller.settings.detection, policy: controller.settings.policy)) ?? .empty
        preview = (try? core.previewProtect(text, settings: controller.settings.detection, keep: Array(keep)))?.text ?? ""
    }

    private func insert() {
        guard let target else { return }
        busy = true
        let name = targets.first { $0.id == target }?.name ?? "the app"
        controller.insertProtected(text, keep: Array(keep), into: target) { outcome in
            busy = false
            switch outcome {
            case .inserted:
                text = "" // the draft is not kept once inserted
                status = (true, "Inserted into \(name). Check it there and press Send.")
            case .notRunning: status = (false, "\(name) isn't running.")
            case .noPromptBox: status = (false, "MIRAGE couldn't find \(name)'s message box. Click in it, then try again.")
            case .notVerified: status = (false, "MIRAGE couldn't confirm the text in \(name). Nothing was sent; check its message box.")
            case .noPermission: status = (false, "MIRAGE needs Accessibility access to insert text.")
            }
        }
    }
}

struct RiskPill: View {
    let level: RiskLevel
    let score: Int
    var body: some View {
        Text(level == .safe ? "Safe" : "\(level.title.replacingOccurrences(of: " privacy", with: "")) · \(score)")
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .foregroundStyle(level.color)
            .background(level.color.opacity(0.14), in: RoundedRectangle(cornerRadius: 6))
    }
}
