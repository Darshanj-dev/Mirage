// Accessibility permission: checked, never requested silently. The system prompt only appears
// when the user presses "Open System Settings" / "Grant access" in MIRAGE's own UI.

import AppKit
import ApplicationServices

@MainActor
public final class PermissionManager: ObservableObject {
    @Published public private(set) var accessibilityGranted = AX.isTrusted()
    public var onChange: ((Bool) -> Void)?
    private var observer: NSObjectProtocol?
    private var timer: Timer?

    public init() {}

    public func start() {
        // The system posts this when any app's Accessibility access changes.
        observer = DistributedNotificationCenter.default().addObserver(
            forName: NSNotification.Name("com.apple.accessibility.api"), object: nil, queue: .main
        ) { [weak self] _ in
            // The trust flag updates a moment after the notification.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { MainActor.assumeIsolated { self?.refresh() } }
        }
        refresh()
    }

    public func refresh() {
        let now = AX.isTrusted()
        if now != accessibilityGranted {
            accessibilityGranted = now
            onChange?(now)
        }
        // While waiting for the user to grant access, check every 2 s (the notification is not
        // always delivered to unsigned development builds). Stops as soon as access is granted.
        if !now, timer == nil {
            timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in MainActor.assumeIsolated { self?.refresh() } }
        } else if now {
            timer?.invalidate()
            timer = nil
        }
    }

    /// Shows the system's Accessibility prompt (only from a user action in MIRAGE's UI).
    public func requestAccess() {
        let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        _ = AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
    }

    public func openSystemSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
    }
}
