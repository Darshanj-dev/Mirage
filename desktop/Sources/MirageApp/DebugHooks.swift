// Development only, and only when launched with --debug-hooks: on the distributed notification
// "dev.mirage.debug.capture", MIRAGE saves images of ITS OWN windows (no other app, no screen)
// and a status file to ~/Library/Logs/MIRAGE/debug. Status holds switches and states only.

import AppKit
import MirageAgent

@MainActor
enum DebugHooks {
    static func install(model: AppModel) {
        guard CommandLine.arguments.contains("--debug-hooks") else { return }
        // Main-thread stalls (input waits on the main thread's event tap): logged when > 100 ms.
        var expected = CFAbsoluteTimeGetCurrent() + 0.05
        Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
            let now = CFAbsoluteTimeGetCurrent()
            let late = (now - expected) * 1000
            expected = now + 0.05
            if late > 100 { MainActor.assumeIsolated { model.controller.trace(String(format: "main-stall %.0fms", late)) } }
        }
        DistributedNotificationCenter.default().addObserver(forName: .init("dev.mirage.debug.capture"), object: nil, queue: .main) { _ in
            MainActor.assumeIsolated { capture(model: model) }
        }
        DistributedNotificationCenter.default().addObserver(forName: .init("dev.mirage.debug.compose"), object: nil, queue: .main) { note in
            MainActor.assumeIsolated {
                guard let text = note.object as? String, let target = model.controller.composeTargets().first(where: { $0.id == .chatgpt }) ?? model.controller.composeTargets().first else { return }
                model.controller.insertProtected(text, keep: [], into: target.id) { _ in }
            }
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
                     "decisionPanel=\(NSApp.windows.first { $0 is FloatingPanel && $0.isVisible && $0.frame.width > 300 && $0.frame.height > 200 }.map { "\(Int($0.frame.minX)),\(Int($0.frame.minY)),\(Int($0.frame.width)),\(Int($0.frame.height))" } ?? "none")",
                     "live=\(model.controller.live.map { "count \($0.count), level \($0.level.rawValue), underlines \($0.marks.count), box \(Int($0.box.minX)),\(Int($0.box.minY)) \(Int($0.box.width))x\(Int($0.box.height)), first underline \($0.marks.first.map { "\(Int($0.rect.minX)),\(Int($0.rect.minY)) \(Int($0.rect.width))x\(Int($0.rect.height))" } ?? "none")" } ?? "none")",
                     "replyAlert=\(model.controller.replyAlert.map { "\($0.analysis.findings.count) finding(s): \($0.analysis.findings.map(\.type))" } ?? "none")",
                     String(format: "gateCheckMs=%.2f backgroundCheckMs=%.0f holdToPanelMs=%.1f", model.controller.lastGateMs, model.controller.lastCheckMs, model.presenter?.holdToPanelMs ?? -1),
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
