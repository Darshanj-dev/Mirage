// Developer tool: `MIRAGE --snapshots <dir>` renders MIRAGE's screens to PNG with the real core
// (fictional demo prompt), for design review without screen recording.

import AppKit
import MirageAgent
import MirageCore
import SwiftUI

@MainActor
enum Snapshots {
    static func render(to dir: URL) {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let controller = ProtectionController()
        guard let core = try? MirageCoreEngine() else { print("core failed"); return }
        let demo = """
        Help me debug my production server.
        AWS_ACCESS_KEY_ID=\(["AKIA", "Q7Z3", "MIRAGEDEMO", "42"].joined())
        AWS_SECRET_ACCESS_KEY=\(["mIr4gEDemo", "FakeKey/xQ9", "zT2vLp8wRn5", "kHs3jQQQ"].joined())
        My PAN is BNZPM2501K.
        My email is priya.demo@example.com.
        """
        guard let analysis = try? core.analyze(demo) else { return }
        for scheme in [ColorScheme.light, .dark] {
            let suffix = scheme == .dark ? "dark" : "light"
            controller.decision = .preview(appName: "ChatGPT", analysis: analysis)
            save(DecisionView(controller: controller), "decision-\(suffix)", scheme, dir)
            controller.decision = .preview(appName: "ChatGPT", analysis: analysis, stage: .confirmSend)
            save(DecisionView(controller: controller), "confirm-\(suffix)", scheme, dir)
            controller.decision = .preview(appName: "ChatGPT", analysis: analysis, stage: .failed("Protection could not be verified. Your original message has not been submitted."))
            save(DecisionView(controller: controller), "failed-\(suffix)", scheme, dir)
            save(MenuBarView(controller: controller, permissions: controller.permissions, windows: WindowManager(controller: controller)), "menubar-\(suffix)", scheme, dir)
            save(DashboardView(controller: controller).frame(width: 560, height: 460), "dashboard-\(suffix)", scheme, dir)
            if let reply = try? core.checkReply("Sure, use this key: \(["AKIA", "Q7Z3", "MIRAGEDEMO", "42"].joined())") {
                save(ReplyAlertView(alert: ReplyAlert(appName: "Claude", analysis: reply)) {}, "reply-\(suffix)", scheme, dir)
            }
        }
        print("wrote snapshots to \(dir.path)")
    }

    private static func save<V: View>(_ view: V, _ name: String, _ scheme: ColorScheme, _ dir: URL) {
        let content = view.environment(\.colorScheme, scheme).padding(20)
            .background(scheme == .dark ? Color(white: 0.12) : Color(white: 0.96))
        let renderer = ImageRenderer(content: content)
        renderer.scale = 2
        guard let image = renderer.nsImage, let tiff = image.tiffRepresentation,
              let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) else { return }
        try? png.write(to: dir.appendingPathComponent("\(name).png"))
    }
}
