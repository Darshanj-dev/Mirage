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
        controller.$decision.map { $0 != nil }.removeDuplicates().sink { [weak self] open in self?.showDecision(open) }.store(in: &bag)
        controller.$replyAlert.sink { [weak self] alert in self?.showReply(alert) }.store(in: &bag)
        controller.$toast.sink { [weak self] toast in self?.showToast(toast) }.store(in: &bag)
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
        let controller = NSHostingController(rootView: view)
        controller.sizingOptions = [.preferredContentSize]
        panel.contentViewController = controller
        controller.view.layoutSubtreeIfNeeded()
        panel.setContentSize(controller.view.fittingSize)
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

    private func showDecision(_ open: Bool) {
        if open {
            let panel = decisionPanel ?? makePanel(DecisionView(controller: controller), key: true)
            decisionPanel = panel
            placeAboveBox(panel)
            panel.orderFrontRegardless()
            panel.makeKey()
            // The panel sizes itself to its content after it appears (and again when Review opens),
            // growing downwards: re-place it on every size change so it is always fully on screen.
            if resizeObserver == nil {
                resizeObserver = NotificationCenter.default.addObserver(forName: NSWindow.didResizeNotification, object: panel, queue: .main) { [weak self, weak panel] _ in
                    MainActor.assumeIsolated { if let self, let panel { self.placeAboveBox(panel) } }
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self, weak panel] in
                if let self, let panel { self.placeAboveBox(panel) }
            }
            holdToPanelMs = (CFAbsoluteTimeGetCurrent() - controller.lastHoldAt) * 1000
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
