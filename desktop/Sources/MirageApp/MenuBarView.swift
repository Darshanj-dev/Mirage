// The menu-bar window: status at a glance, today's counts, protected apps, and the way in to
// everything else. It never shows prompt text or values.

import MirageAgent
import MirageCore
import SwiftUI

struct MenuBarView: View {
    @ObservedObject var controller: ProtectionController
    @ObservedObject var permissions: PermissionManager
    let windows: WindowManager
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                ShieldMark(color: statusColor)
                Text("MIRAGE").font(.headline).tracking(1)
                Spacer()
                Toggle("", isOn: Binding(get: { controller.settings.protectionOn }, set: { v in controller.update { $0.protectionOn = v } }))
                    .toggleStyle(.switch).labelsHidden().controlSize(.small)
                    .accessibilityLabel("Protection")
            }
            HStack(spacing: 8) {
                StatusDot(color: statusColor)
                Text(statusText).font(.subheadline.weight(.medium))
            }

            if !permissions.accessibilityGranted {
                VStack(alignment: .leading, spacing: 8) {
                    Text("MIRAGE needs Accessibility access to protect text inside supported AI apps.").font(.caption).fixedSize(horizontal: false, vertical: true)
                    Button("Open Permissions") { windows.show(.permissions) }
                }
                .padding(10).background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
            }

            Button {
                windows.show(.compose)
            } label: {
                Label("Private Compose", systemImage: "square.and.pencil").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .help("Write in MIRAGE; only the protected text goes into ChatGPT or Claude (⌥⌘M)")

            VStack(alignment: .leading, spacing: 6) {
                Text("TODAY").font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    StatTile(value: controller.stats.today.protectedSends, label: "Protected")
                    StatTile(value: controller.stats.today.secretsRemoved, label: "Risks blocked", tint: .red)
                    StatTile(value: controller.stats.today.masked, label: "Items masked")
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("PROTECTED APPS").font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(.secondary)
                ForEach(controller.apps) { app in
                    StatusRow(title: app.name, value: app.state.text, color: app.state.color)
                }
            }

            VStack(spacing: 4) {
                StatusRow(title: "Local detection", value: controller.coreStatus == "Running" ? "On" : controller.coreStatus, color: controller.coreStatus == "Running" ? .green : .red)
                StatusRow(title: "Network", value: "Not used", color: .green)
            }
            .font(.callout)

            Divider()
            HStack {
                Button("Dashboard") { windows.show(.dashboard) }
                Button("Settings…") { openSettings(); NSApp.activate(ignoringOtherApps: true) }
                Spacer()
                Button("Quit") { NSApp.terminate(nil) }.keyboardShortcut("q")
            }
            .buttonStyle(.borderless)
        }
        .padding(16)
        .frame(width: 330)
        .onAppear { controller.refreshApps(); permissions.refresh() }
    }

    private var statusColor: Color {
        if !controller.settings.protectionOn || controller.coreStatus != "Running" { return .secondary }
        if !permissions.accessibilityGranted { return .orange }
        return controller.liveRisk == .safe ? .green : controller.liveRisk.color
    }

    private var statusText: String {
        if controller.coreStatus != "Running" { return "Detection unavailable" }
        if !controller.settings.protectionOn { return "Protection paused" }
        if !permissions.accessibilityGranted { return "Waiting for permission" }
        return "Protection active"
    }
}
