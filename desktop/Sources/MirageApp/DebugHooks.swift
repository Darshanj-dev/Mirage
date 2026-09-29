// Development only, and only when launched with --debug-hooks: on the distributed notification
// "dev.mirage.debug.capture", MIRAGE saves images of ITS OWN windows (no other app, no screen)
// and a status file to ~/Library/Logs/MIRAGE/debug. Status holds switches and states only.

import AppKit
import MirageAgent

@MainActor
enum DebugHooks {
    static func install(model: AppModel) {
        guard CommandLine.arguments.contains("--debug-hooks") else { return }
        DistributedNotificationCenter.default().addObserver(forName: .init("dev.mirage.debug.capture"), object: nil, queue: .main) { _ in
            MainActor.assumeIsolated { capture(model: model) }
        }
        // The same calls the panel's buttons make, for the end-to-end driver.
        DistributedNotificationCenter.default().addObserver(forName: .init("dev.mirage.debug.decide"), object: nil, queue: .main) { note in
            MainActor.assumeIsolated {
                switch note.object as? String {
                case "protect": model.controller.protectAndSend()
                case "cancel": model.controller.cancel()
                default: break
                }
            }
        }
    }

    static func capture(model: AppModel) {
        let dir = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Logs/MIRAGE/debug", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var lines = ["trusted=\(AX.isTrusted())", "permissionPublished=\(model.controller.permissions.accessibilityGranted)",
                     "core=\(model.controller.coreStatus)", "gateActive=\(model.controller.gateActive)",
                     "protectionOn=\(model.controller.settings.protectionOn)", "onboardingDone=\(model.controller.settings.onboardingDone)",
                     "gateEvents=\(model.controller.gateEvents)", "lastGateReason=\(model.controller.lastGateReason)",
                     "chatgptEnabled=\(model.controller.settings.appEnabled(.chatgpt))",
                     "decisionOpen=\(model.controller.decision != nil)",
                     "replyAlert=\(model.controller.replyAlert.map { "\($0.analysis.findings.count) finding(s): \($0.analysis.findings.map(\.type))" } ?? "none")",
                     String(format: "gateCheckMs=%.1f holdToPanelMs=%.1f", model.controller.lastGateMs, model.presenter?.holdToPanelMs ?? -1),
                     "panels=\(NSApp.windows.filter { $0 is NSPanel }.map { "\(type(of: $0)) visible=\($0.isVisible) \(Int($0.frame.width))x\(Int($0.frame.height))" })"]
        lines += model.controller.apps.map { "app \($0.id.rawValue)=\($0.state)" }
        for (i, window) in NSApp.windows.enumerated() where window.isVisible {
            lines.append("window \(i) '\(window.title)' \(Int(window.frame.width))x\(Int(window.frame.height)) onActiveSpace=\(window.isOnActiveSpace) key=\(window.isKeyWindow)")
            guard let view = window.contentView, let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { continue }
            view.cacheDisplay(in: view.bounds, to: rep)
            try? rep.representation(using: .png, properties: [:])?.write(to: dir.appendingPathComponent("window-\(i).png"))
        }
        try? lines.joined(separator: "\n").write(to: dir.appendingPathComponent("status.txt"), atomically: true, encoding: .utf8)
    }
}
