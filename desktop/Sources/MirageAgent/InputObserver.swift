// Watches the supported app's prompt box for changes (AXObserver notifications, debounced), so
// the menu-bar shield can show the current prompt's risk while the user types. Only the front
// supported app is observed; the observer is removed when it loses focus.

import AppKit
import ApplicationServices

@MainActor
public final class InputObserver {
    private var observer: AXObserver?
    private var pid: pid_t = 0
    private var debounce: DispatchWorkItem?
    public var onChange: (() -> Void)?
    /// When the app last reported a change (for the timings in gate.log).
    public private(set) var lastChangeAt: CFAbsoluteTime = 0
    private static let debounceSeconds = 0.12

    public init() {}

    public func observe(app: AXElement, pid: pid_t) {
        stop()
        var obs: AXObserver?
        let callback: AXObserverCallback = { _, _, _, refcon in
            guard let refcon else { return }
            let me = Unmanaged<InputObserver>.fromOpaque(refcon).takeUnretainedValue()
            MainActor.assumeIsolated { me.changed() }
        }
        guard AXObserverCreate(pid, callback, &obs) == .success, let obs else { return }
        let refcon = Unmanaged.passUnretained(self).toOpaque()
        for n in [kAXValueChangedNotification, kAXFocusedUIElementChangedNotification, kAXSelectedTextChangedNotification] {
            AXObserverAddNotification(obs, app, n as CFString, refcon)
        }
        CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(obs), .commonModes)
        observer = obs
        self.pid = pid
    }

    public func stop() {
        debounce?.cancel()
        if let observer { CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .commonModes) }
        observer = nil
        pid = 0
    }

    private func changed() {
        lastChangeAt = CFAbsoluteTimeGetCurrent()
        debounce?.cancel()
        let work = DispatchWorkItem { [weak self] in MainActor.assumeIsolated { self?.onChange?() } }
        debounce = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.debounceSeconds, execute: work)
    }
}
