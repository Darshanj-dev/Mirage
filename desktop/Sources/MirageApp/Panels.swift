// Floating panels for the decision, reply alerts and toasts. Non-activating: the AI app stays in
// front (so its held send stays held) while the panel takes clicks and, when focused, keys.

import AppKit
import Combine
import MirageAgent
import SwiftUI

final class FloatingPanel: NSPanel {
    var allowsKey = true
    override var canBecomeKey: Bool { allowsKey }
    override var canBecomeMain: Bool { false }
}

@MainActor
final class PanelPresenter {
    private let controller: ProtectionController
    private var decisionPanel: FloatingPanel?
    private var replyPanel: FloatingPanel?
    private var toastPanel: FloatingPanel?
    private var bag = Set<AnyCancellable>()
    private var resizeObserver: NSObjectProtocol?
    private(set) var holdToPanelMs: Double = 0

    init(controller: ProtectionController) {
        self.controller = controller
        controller.isDecisionPanelKey = { [weak self] in self?.decisionPanel?.isKeyWindow == true }
        controller.isOnMirageWindow = { axPoint in
            // AX points are top-left based; AppKit frames bottom-left.
            let h = NSScreen.screens.first?.frame.height ?? 0
            let p = NSPoint(x: axPoint.x, y: h - axPoint.y)
            return NSApp.windows.contains { $0.isVisible && !$0.ignoresMouseEvents && $0.frame.contains(p) }
        }
        // (@Published sends before the property changes: read `early` from the new value, not the controller.)
        controller.$decision.map { $0.map { $0.early } }.removeDuplicates().sink { [weak self] d in self?.showDecision(d != nil, early: d == true) }.store(in: &bag)
        controller.$decision.dropFirst().sink { [weak self] d in
            guard d != nil else { return }
            DispatchQueue.main.async { self?.fitDecisionPanel() }
        }.store(in: &bag)
        controller.$replyAlert.sink { [weak self] alert in self?.showReply(alert) }.store(in: &bag)
        controller.$toast.sink { [weak self] toast in self?.showToast(toast) }.store(in: &bag)
    }

    /// The size a panel's SwiftUI content needs, measured explicitly. (Automatic sizing left the
    /// decision panel at 0 × 0: shown, but invisible. Seen live.)
    static func measure(_ view: NSView, width: CGFloat?) -> NSSize {
        view.frame = NSRect(x: 0, y: 0, width: width ?? 600, height: 2000)
        view.layoutSubtreeIfNeeded()
        var size = view.fittingSize
        if let width { size.width = width }
        if size.width < 40 || size.height < 40 { size = NSSize(width: width ?? 440, height: 420) }
        return size
    }

    /// Sizes the decision panel to its content (440 wide), then places it above the prompt box.
    private func fitDecisionPanel() {
        guard let panel = decisionPanel, let view = panel.contentView else { return }
        let size = Self.measure(view, width: 476) // DecisionView is 440 wide plus its padding
        let maxHeight = (NSScreen.main?.visibleFrame.height ?? 800) - 40
        let final = NSSize(width: size.width, height: min(size.height, maxHeight))
        panel.setContentSize(final)
        view.frame = NSRect(origin: .zero, size: final) // the view exactly fills the panel
        placeAboveBox(panel)
    }

    private func makePanel<V: View>(_ view: V, key: Bool) -> FloatingPanel {
        let panel = FloatingPanel(contentRect: .zero, styleMask: [.nonactivatingPanel, .borderless], backing: .buffered, defer: false)
        panel.allowsKey = key
        panel.level = .floating
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        // The hosting controller sizes the panel from its SwiftUI content, and keeps it sized as
        // the content changes (e.g. Review expanding): never a zero-size panel.
        // A hosting VIEW with automatic sizing off: MIRAGE sets the size. (A hosting controller kept
        // resetting the panel to 0 × 0: shown but invisible. Seen live.)
        let host = NSHostingView(rootView: view)
        host.sizingOptions = []
        panel.contentView = host
        let size = Self.measure(host, width: nil)
        panel.setContentSize(size)
        host.frame = NSRect(origin: .zero, size: size)
        return panel
    }

    /// Right above the AI app's prompt box, centred on it, like the extension's panel; fully on
    /// screen (below the box's top if there is no room above). Falls back to the screen's bottom.
    private func placeAboveBox(_ panel: NSPanel) {
        let size = panel.frame.size
        let cocoaBox = controller.promptBoxFrame.map(ScreenCoords.toCocoa)
        let screen = cocoaBox.flatMap { box in NSScreen.screens.first { $0.frame.intersects(box) } }
            ?? NSScreen.screens.first { $0.frame.contains(NSEvent.mouseLocation) } ?? NSScreen.main
        guard let frame = screen?.visibleFrame else { return }
        var x = (cocoaBox?.midX ?? frame.midX) - size.width / 2
        // Above the box's top edge; if there is no room above, as high as fits.
        var y = (cocoaBox?.maxY ?? frame.minY + 160) + 10
        y = min(y, frame.maxY - size.height - 8)
        y = max(y, frame.minY + 8)
        x = min(max(x, frame.minX + 8), frame.maxX - size.width - 8)
        let origin = NSPoint(x: x, y: y)
        if panel.frame.origin != origin { panel.setFrameOrigin(origin) }
    }

    /// Bottom-centre of the screen the mouse is on, above the Dock, always fully on screen.
    private func place(_ panel: NSPanel, offset: CGFloat) {
        let screen = NSScreen.screens.first { $0.frame.contains(NSEvent.mouseLocation) } ?? NSScreen.main
        guard let frame = screen?.visibleFrame else { return }
        let size = panel.frame.size
        let y = min(max(frame.minY + offset, frame.minY + 8), frame.maxY - size.height - 8)
        panel.setFrameOrigin(NSPoint(x: frame.midX - size.width / 2, y: max(frame.minY + 8, y)))
    }

    private func showDecision(_ open: Bool, early: Bool) {
        if open {
            let panel = decisionPanel ?? makePanel(DecisionView(controller: controller), key: !early)
            decisionPanel = panel
            fitDecisionPanel()
            panel.orderFrontRegardless()
            // Opened while typing: the panel never takes the keyboard (it became key by itself when
            // shown, and typing went into it), so typing continues in the AI app. Clicks still work.
            panel.allowsKey = !early
            if !early { panel.makeKey() }
            // The panel sizes itself to its content after it appears (and again when Review opens),
            // growing downwards: re-place it on every size change so it is always fully on screen.
            if resizeObserver == nil {
                resizeObserver = NotificationCenter.default.addObserver(forName: NSWindow.didResizeNotification, object: panel, queue: .main) { [weak self, weak panel] _ in
                    MainActor.assumeIsolated { if let self, let panel { self.placeAboveBox(panel) } }
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in self?.fitDecisionPanel() }
            holdToPanelMs = (CFAbsoluteTimeGetCurrent() - controller.lastHoldAt) * 1000
            let heldAt = controller.lastHoldAt
            for delay in [0.0, 0.3, 1.0] {
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self, weak panel] in
                    guard let self, let panel else { return }
                    let f = panel.frame
                    let onScreen = NSScreen.screens.contains { $0.visibleFrame.insetBy(dx: -2, dy: -2).contains(f) }
                    self.controller.trace(String(format: "panel +%.0fms visible=%@ size=%.0fx%.0f onScreen=%@",
                        (CFAbsoluteTimeGetCurrent() - heldAt) * 1000, panel.isVisible ? "yes" : "no", f.width, f.height, onScreen ? "yes" : "no"))
                }
            }
        } else {
            if let o = resizeObserver { NotificationCenter.default.removeObserver(o) }
            resizeObserver = nil
            decisionPanel?.orderOut(nil)
            decisionPanel = nil
        }
    }

    private func showReply(_ alert: ReplyAlert?) {
        replyPanel?.orderOut(nil)
        replyPanel = nil
        guard let alert else { return }
        let panel = makePanel(ReplyAlertView(alert: alert) { [weak self] in self?.controller.replyAlert = nil }, key: true)
        replyPanel = panel
        place(panel, offset: 420)
        panel.orderFrontRegardless()
    }

    private func showToast(_ toast: Toast?) {
        toastPanel?.orderOut(nil)
        toastPanel = nil
        guard let toast else { return }
        let panel = makePanel(ToastView(toast: toast), key: false)
        panel.ignoresMouseEvents = true
        toastPanel = panel
        place(panel, offset: 160)
        panel.orderFrontRegardless()
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            if self?.controller.toast == toast { self?.controller.toast = nil }
        }
    }
}
