// MIRAGE desktop companion: a menu-bar app. No Dock icon, no main window.
//   MIRAGE --inspect <bundle-id>   developer tool: writes an app's Accessibility structure
//                                  (roles and labels, never text) to ~/Library/Logs/MIRAGE.

import AppKit
import MirageAgent
import MirageCore
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    static let shared = AppModel()
    let controller = ProtectionController()
    let windows: WindowManager
    private(set) var presenter: PanelPresenter?
    private var overlay: OverlayPresenter?
    private let hotkey = Hotkey()

    private init() {
        windows = WindowManager(controller: controller)
        controller.start()
        presenter = PanelPresenter(controller: controller)
        overlay = OverlayPresenter(controller: controller)
        let windows = windows
        hotkey.register { windows.show(.compose) }
    }
}

/// Opens a window at launch (first run: the welcome screen) and whenever MIRAGE is opened again
/// while running (double-click in Finder, Spotlight, `open`): a menu-bar app must never look
/// like it did nothing, e.g. when its icon is hidden behind the notch.
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        MainActor.assumeIsolated {
            let model = AppModel.shared
            DebugHooks.install(model: model)
            // First run: the welcome screen. After that MIRAGE starts quietly in the menu bar
            // (it may start at login); opening it again shows the dashboard.
            if !model.controller.settings.onboardingDone { model.windows.show(.onboarding) }
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        MainActor.assumeIsolated {
            let model = AppModel.shared
            model.windows.show(model.controller.settings.onboardingDone ? .dashboard : .onboarding)
        }
        return true
    }
}

@main
struct MirageMain {
    static func main() {
        let args = CommandLine.arguments
        if let i = args.firstIndex(of: "--inspect"), i + 1 < args.count {
            let id = args[i + 1]
            let adapter = AdapterRegistry.adapter(forBundle: id)
            let out = Inspector.dump(bundleID: id) { adapter?.prepare(app: $0) }
            print(out.map { "wrote \($0.path) (trusted: \(AX.isTrusted()))" } ?? "\(id) is not running (trusted: \(AX.isTrusted()))")
            exit(out == nil ? 1 : 0)
        }
        if let i = args.firstIndex(of: "--check-conversation"), i + 1 < args.count {
            let dir = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Logs/MIRAGE", isDirectory: true)
            try? EndToEnd.checkConversation(bundleID: args[i + 1]).joined(separator: "\n").write(to: dir.appendingPathComponent("conversation-\(args[i + 1]).txt"), atomically: true, encoding: .utf8)
            exit(0)
        }
        if let i = args.firstIndex(of: "--e2e"), i + 1 < args.count {
            let action = i + 2 < args.count ? args[i + 2] : "protect"
            let report = EndToEnd.run(bundleID: args[i + 1], action: action)
            let dir = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Logs/MIRAGE", isDirectory: true)
            try? report.joined(separator: "\n").write(to: dir.appendingPathComponent("e2e-\(args[i + 1])-\(action).txt"), atomically: true, encoding: .utf8)
            exit(0)
        }
        if let i = args.firstIndex(of: "--read-adapter"), i + 1 < args.count {
            let dir = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Logs/MIRAGE", isDirectory: true)
            try? AdapterReadCheck.run(bundleID: args[i + 1]).joined(separator: "\n").write(to: dir.appendingPathComponent("read-\(args[i + 1]).txt"), atomically: true, encoding: .utf8)
            exit(0)
        }
        if let i = args.firstIndex(of: "--selftest-adapter"), i + 1 < args.count {
            let report = AdapterSelfTest.run(bundleID: args[i + 1])
            let dir = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Logs/MIRAGE", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try? report.joined(separator: "\n").write(to: dir.appendingPathComponent("selftest-\(args[i + 1]).txt"), atomically: true, encoding: .utf8)
            exit(0)
        }
        if let i = args.firstIndex(of: "--snapshots"), i + 1 < args.count {
            MainActor.assumeIsolated { Snapshots.render(to: URL(fileURLWithPath: args[i + 1])) }
            exit(0)
        }
        MirageApp.main()
    }
}

struct MirageApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var model = AppModel.shared

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(controller: model.controller, permissions: model.controller.permissions, windows: model.windows)
        } label: {
            MenuBarIcon(controller: model.controller)
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView(controller: model.controller, permissions: model.controller.permissions)
        }
    }
}

/// The shield in the menu bar: filled when protection is on, tinted by the live prompt's risk.
struct MenuBarIcon: View {
    @ObservedObject var controller: ProtectionController
    var body: some View {
        let on = controller.settings.protectionOn && controller.permissions.accessibilityGranted
        let symbol = !on ? "shield.slash" : controller.liveRisk == .critical || controller.liveRisk == .high ? "exclamationmark.shield.fill" : "shield.lefthalf.filled"
        Image(systemName: symbol).accessibilityLabel("MIRAGE")
    }
}
