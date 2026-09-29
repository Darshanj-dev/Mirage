// Onboarding, dashboard, and the settings centres (General, Applications, Detection, Policy,
// Permissions, Privacy, Security). Every number shown is a real local count; there is no demo
// data in production builds.

import MirageAgent
import MirageCore
import ServiceManagement
import SwiftUI

// MARK: - onboarding

struct OnboardingView: View {
    @ObservedObject var controller: ProtectionController
    @ObservedObject var permissions: PermissionManager
    var onDone: () -> Void = {}
    @State private var step = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            if step == 0 { welcome } else { permission }
        }
        .padding(32)
        .frame(width: 520, height: 400, alignment: .topLeading)
    }

    private var welcome: some View {
        VStack(alignment: .leading, spacing: 16) {
            ShieldMark(size: 40)
            Text("MIRAGE").font(.caption.weight(.bold)).tracking(2).foregroundStyle(.secondary)
            Text("Protect your conversations before sensitive information reaches AI.").font(.title2.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
            Text("MIRAGE watches supported AI desktop apps and checks what you are about to send, on this Mac. When it finds a secret or personal detail, it stops the send and lets you decide.")
                .foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            Spacer()
            HStack { Spacer(); Button("Get Started") { step = 1 }.keyboardShortcut(.defaultAction).controlSize(.large) }
        }
    }

    private var permission: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("One permission").font(.title2.weight(.semibold))
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "accessibility").font(.title).foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Accessibility").font(.headline)
                    Text("Required to identify and protect text inside supported AI applications.").fixedSize(horizontal: false, vertical: true)
                    Text("MIRAGE reads the message box of ChatGPT and Claude only, and only looks at the Return key and the Send button while one of them is in front. It does not record your screen, your keyboard or other apps.")
                        .font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
            StatusRow(title: "Accessibility", value: permissions.accessibilityGranted ? "Granted" : "Not granted", color: permissions.accessibilityGranted ? .green : .orange)
            Spacer()
            HStack {
                if !permissions.accessibilityGranted {
                    Button("Open System Settings") { permissions.requestAccess(); permissions.openSystemSettings() }
                }
                Spacer()
                Button(permissions.accessibilityGranted ? "Done" : "Later") {
                    controller.update { $0.onboardingDone = true }
                    onDone()
                }
                .keyboardShortcut(.defaultAction)
            }
        }
    }
}

// MARK: - dashboard

struct DashboardView: View {
    @ObservedObject var controller: ProtectionController
    @State private var range = 0

    var body: some View {
        let c = range == 0 ? controller.stats.today : controller.stats.total
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                ShieldMark(size: 24)
                Text("Protection overview").font(.title2.weight(.semibold))
                Spacer()
                Picker("", selection: $range) { Text("Today").tag(0); Text("All time").tag(1) }.pickerStyle(.segmented).frame(width: 180)
            }
            if c.checked == 0 && c.held == 0 {
                emptyState
            } else {
                Grid(horizontalSpacing: 10, verticalSpacing: 10) {
                    GridRow {
                        StatTile(value: c.protectedSends, label: "Prompts protected")
                        StatTile(value: c.masked, label: "Sensitive items masked")
                    }
                    GridRow {
                        StatTile(value: c.secretsRemoved, label: "Critical risks blocked", tint: .red)
                        StatTile(value: controller.stats.appsSeen.count, label: "Applications protected")
                    }
                    GridRow {
                        StatTile(value: c.checked, label: "Prompts checked")
                        StatTile(value: c.replyWarnings, label: "Replies flagged", tint: .orange)
                    }
                }
                categories(c)
            }
            Spacer()
            HStack {
                Text("Counts only. MIRAGE never stores what you typed.").font(.caption).foregroundStyle(.secondary)
                Spacer()
                Button("Reset statistics", role: .destructive) { controller.resetStats() }.buttonStyle(.link)
            }
        }
        .padding(24)
        .frame(minWidth: 560, minHeight: 460)
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "shield").font(.largeTitle).foregroundStyle(.tertiary)
            Text("Nothing checked yet").font(.headline)
            Text("Open ChatGPT or Claude and send a prompt. MIRAGE's counts appear here.").foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 40)
    }

    private func categories(_ c: Counts) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("CATEGORIES").font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(.secondary)
            let total = max(1, c.byCategory.values.reduce(0, +))
            ForEach(MirageCore.Category.allCases, id: \.self) { cat in
                let n = c.byCategory[cat.rawValue] ?? 0
                HStack {
                    Text(Names.categories[cat]?.0 ?? cat.rawValue).frame(width: 150, alignment: .leading)
                    GeometryReader { g in
                        RoundedRectangle(cornerRadius: 3).fill(.tint.opacity(n == 0 ? 0.1 : 0.7)).frame(width: max(4, g.size.width * CGFloat(n) / CGFloat(total)))
                    }
                    .frame(height: 8)
                    Text("\(n)").monospacedDigit().frame(width: 36, alignment: .trailing).foregroundStyle(.secondary)
                }
                .font(.callout)
            }
        }
    }
}

// MARK: - settings

struct SettingsView: View {
    @ObservedObject var controller: ProtectionController
    @ObservedObject var permissions: PermissionManager

    var body: some View {
        TabView {
            GeneralPane(controller: controller).tabItem { Label("General", systemImage: "gearshape") }
            AppsPane(controller: controller).tabItem { Label("Applications", systemImage: "app.badge.checkmark") }
            DetectionPane(controller: controller).tabItem { Label("Detection", systemImage: "magnifyingglass") }
            PolicyPane(controller: controller).tabItem { Label("Policy", systemImage: "slider.horizontal.3") }
            PermissionsPane(permissions: permissions).tabItem { Label("Permissions", systemImage: "lock.shield") }
            PrivacyPane().tabItem { Label("Privacy", systemImage: "hand.raised") }
            SecurityPane(controller: controller, permissions: permissions).tabItem { Label("Security", systemImage: "checkmark.shield") }
        }
        .frame(width: 560, height: 440)
    }
}

private struct GeneralPane: View {
    @ObservedObject var controller: ProtectionController
    @State private var loginError: String?
    var body: some View {
        Form {
            Toggle("Protection", isOn: bind(\.protectionOn))
            Toggle("Start MIRAGE at login", isOn: Binding(get: { controller.settings.startAtLogin }, set: setLogin))
            if let loginError { Text(loginError).font(.caption).foregroundStyle(.orange) }
            Toggle("Check AI replies for secrets and ID numbers", isOn: bind(\.checkReplies))
            if controller.settingsWereRecovered {
                Label("Your settings file was damaged and has been reset to defaults.", systemImage: "exclamationmark.triangle").foregroundStyle(.orange)
            }
            Button("Forget this session's placeholders") { controller.clearSessionPlaceholders() }
        }
        .formStyle(.grouped)
    }
    private func bind(_ kp: WritableKeyPath<DesktopSettings, Bool>) -> Binding<Bool> {
        Binding(get: { controller.settings[keyPath: kp] }, set: { v in controller.update { $0[keyPath: kp] = v } })
    }
    private func setLogin(_ on: Bool) {
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            loginError = nil
            controller.update { $0.startAtLogin = on }
        } catch {
            loginError = "macOS didn't allow this. Move MIRAGE to Applications and try again."
        }
    }
}

private struct AppsPane: View {
    @ObservedObject var controller: ProtectionController
    var body: some View {
        Form {
            Section {
                ForEach(controller.apps) { app in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(app.name)
                            Text(app.state.text).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Toggle("", isOn: Binding(get: { controller.settings.appEnabled(app.id) }, set: { v in controller.update { $0.apps[app.id] = v } }))
                            .labelsHidden().disabled(app.state == .unsupported)
                    }
                }
            } footer: {
                Text("MIRAGE protects supported AI desktop applications only. Other AI apps are shown as unsupported and are never described as protected.")
            }
            Section("Not yet supported") {
                ForEach(AdapterRegistry.knownUnsupported.values.sorted(), id: \.self) { name in
                    StatusRow(title: name, value: "Unsupported AI application", color: .secondary)
                }
            }
        }
        .formStyle(.grouped)
    }
}

private struct DetectionPane: View {
    @ObservedObject var controller: ProtectionController
    var body: some View {
        Form {
            ForEach(MirageCore.Category.allCases, id: \.self) { cat in
                Toggle(isOn: Binding(
                    get: { controller.settings.detection.categories[cat] ?? true },
                    set: { v in controller.update { $0.detection.categories[cat] = v } }
                )) {
                    VStack(alignment: .leading) {
                        Text(Names.categories[cat]?.0 ?? cat.rawValue)
                        Text(Names.categories[cat]?.1 ?? "").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .formStyle(.grouped)
    }
}

private struct PolicyPane: View {
    @ObservedObject var controller: ProtectionController
    private let options: [(PolicyAction, String)] = [(.warn, "Warn"), (.recommendMask, "Warn + recommend mask"), (.protect, "Protect by default"), (.confirm, "Block · explicit confirmation")]
    var body: some View {
        Form {
            Section {
                row("Low", \.low, "Emails, IFSC codes, IP addresses")
                row("Medium", \.medium, "Names, phone numbers, UPI IDs, dates of birth")
                row("High", \.high, "Aadhaar, PAN, bank accounts")
                row("Critical", \.critical, "API keys, passwords, private keys, cards, one-time codes")
            } footer: {
                Text("Whatever the policy, nothing is sent until you choose, and secrets are never sent without an explicit confirmation.")
            }
        }
        .formStyle(.grouped)
    }
    private func row(_ title: String, _ kp: WritableKeyPath<PolicySettings, PolicyAction>, _ hint: String) -> some View {
        Picker(selection: Binding(get: { controller.settings.policy[keyPath: kp] }, set: { v in controller.update { $0.policy[keyPath: kp] = v } })) {
            ForEach(options, id: \.0) { Text($0.1).tag($0.0) }
        } label: {
            VStack(alignment: .leading) { Text(title); Text(hint).font(.caption).foregroundStyle(.secondary) }
        }
    }
}

struct PermissionsPane: View {
    @ObservedObject var permissions: PermissionManager
    var body: some View {
        Form {
            Section {
                StatusRow(title: "Accessibility", value: permissions.accessibilityGranted ? "Granted" : "Not granted", color: permissions.accessibilityGranted ? .green : .orange)
                Text("Allows MIRAGE to identify and protect text inside supported AI applications.").font(.callout).foregroundStyle(.secondary)
                if !permissions.accessibilityGranted {
                    Button("Open System Settings") { permissions.requestAccess(); permissions.openSystemSettings() }
                    Text("Already switched on but still not granted? macOS is holding an old entry: select MIRAGE in the list, remove it with −, then press Open System Settings again and switch it on.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Section("Not requested") {
                StatusRow(title: "Screen Recording", value: "Not needed", color: .secondary)
                StatusRow(title: "Microphone", value: "Not needed", color: .secondary)
                StatusRow(title: "Network", value: "Not used", color: .secondary)
            }
        }
        .formStyle(.grouped)
        .onAppear { permissions.refresh() }
    }
}

private struct PrivacyPane: View {
    var body: some View {
        Form {
            Section {
                StatusRow(title: "Local processing", value: "Active", color: .green)
                StatusRow(title: "Cloud processing", value: "Not required", color: .green)
                StatusRow(title: "Data collection", value: "None", color: .green)
            }
            Section("What MIRAGE keeps") {
                Text("Your settings and anonymous counts (for the dashboard), in ~/Library/Application Support/MIRAGE.")
                Text("Placeholders for this session only, in memory. They are gone when MIRAGE quits.")
            }
            Section("What MIRAGE never stores") {
                Text("Prompts, passwords, API keys, private keys, or any raw sensitive value. Logs name the kind of item found, never the item.")
            }
        }
        .formStyle(.grouped)
    }
}

private struct SecurityPane: View {
    @ObservedObject var controller: ProtectionController
    @ObservedObject var permissions: PermissionManager
    var body: some View {
        Form {
            Section("MIRAGE security status") {
                StatusRow(title: "Core", value: controller.coreVersion.map { "Running · v\($0)" } ?? controller.coreStatus, color: controller.coreVersion == nil ? .red : .green)
                StatusRow(title: "Detection", value: controller.coreVersion == nil ? "Unavailable" : "Active", color: controller.coreVersion == nil ? .red : .green)
                StatusRow(title: "Protection", value: controller.settings.protectionOn ? "Active" : "Paused", color: controller.settings.protectionOn ? .green : .secondary)
                StatusRow(title: "Send guard", value: controller.gateActive ? "Armed for the app in front" : "Idle (no protected app in front)", color: controller.gateActive ? .green : .secondary)
                StatusRow(title: "Local processing", value: "Active", color: .green)
                StatusRow(title: "Permissions", value: permissions.accessibilityGranted ? "Accessibility only" : "Accessibility missing", color: permissions.accessibilityGranted ? .green : .orange)
                StatusRow(title: "No raw prompt logging", value: "Enabled", color: .green)
                if let ms = controller.lastDetectionMs {
                    StatusRow(title: "Last check took", value: String(format: "%.1f ms", ms), color: .green)
                }
            }
        }
        .formStyle(.grouped)
    }
}
