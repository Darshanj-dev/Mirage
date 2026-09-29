// Tracks which app is in front, event-driven (NSWorkspace notifications): no polling, and
// nothing about unrelated apps is inspected or stored — only "is the front app a supported one".

import AppKit

@MainActor
public final class AppMonitor {
    public struct FrontApp: Equatable {
        public let pid: pid_t
        public let bundleID: String
    }

    public var onChange: ((FrontApp?) -> Void)?
    public var onWake: (() -> Void)?
    private var tokens: [NSObjectProtocol] = []

    public init() {}

    public func start() {
        let ws = NSWorkspace.shared.notificationCenter
        tokens.append(ws.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.emit() }
        })
        tokens.append(ws.addObserver(forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.emit() }
        })
        tokens.append(ws.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.onWake?() }
        })
        emit()
    }

    public func stop() {
        tokens.forEach { NSWorkspace.shared.notificationCenter.removeObserver($0) }
        tokens.removeAll()
    }

    public func current() -> FrontApp? {
        guard let app = NSWorkspace.shared.frontmostApplication, let id = app.bundleIdentifier else { return nil }
        return FrontApp(pid: app.processIdentifier, bundleID: id)
    }

    private func emit() { onChange?(current()) }

    public static func isRunning(bundleIDs: [String]) -> Bool {
        NSWorkspace.shared.runningApplications.contains { app in bundleIDs.contains(app.bundleIdentifier ?? "") }
    }
}
