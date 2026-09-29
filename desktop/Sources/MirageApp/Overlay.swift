// The live layer over the AI app, like the extension's: a shield badge at the prompt box's top
// right (item count, coloured by risk) and underlines under what MIRAGE found as you type (blue:
// will be hidden, red wavy: a secret). Click-through, drawn by MIRAGE; the app is never changed.

import AppKit
import Combine
import MirageAgent
import MirageCore
import SwiftUI

/// Accessibility rectangles (top-left origin) → AppKit screen rectangles (bottom-left origin).
enum ScreenCoords {
    static func toCocoa(_ r: CGRect) -> CGRect {
        let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
        return CGRect(x: r.minX, y: primaryHeight - r.maxY, width: r.width, height: r.height)
    }
}

@MainActor
final class OverlayPresenter {
    private let controller: ProtectionController
    private var marksPanel: NSPanel?
    private var badgePanel: NSPanel?
    private var tipPanel: NSPanel?
    private var mouseMonitor: Any?
    private var current: LiveMarks?
    private var bag = Set<AnyCancellable>()

    init(controller: ProtectionController) {
        self.controller = controller
        controller.$live.removeDuplicates().sink { [weak self] live in self?.show(live) }.store(in: &bag)
        controller.$decision.map { $0 != nil }.removeDuplicates().sink { [weak self] open in
            if open { self?.badgePanel?.orderOut(nil) } else { self?.show(controller.live) }
        }.store(in: &bag)
    }

    private func panel(_ rect: CGRect, clickThrough: Bool) -> NSPanel {
        let p = NSPanel(contentRect: rect, styleMask: [.nonactivatingPanel, .borderless], backing: .buffered, defer: false)
        p.level = .floating
        p.backgroundColor = .clear
        p.isOpaque = false
        p.hasShadow = false
        p.ignoresMouseEvents = clickThrough
        p.hidesOnDeactivate = false
        p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        return p
    }

    /// Hover, like the extension: pointer over an underlined item → what it will be sent as.
    /// Watches the pointer's position only, only while there are marks on screen.
    private func watchPointer(_ on: Bool) {
        if on, mouseMonitor == nil {
            mouseMonitor = NSEvent.addGlobalMonitorForEvents(matching: .mouseMoved) { [weak self] _ in
                MainActor.assumeIsolated { self?.pointerMoved() }
            }
        } else if !on, let m = mouseMonitor {
            NSEvent.removeMonitor(m)
            mouseMonitor = nil
            tipPanel?.orderOut(nil)
        }
    }

    private func pointerMoved() {
        guard let live = current, controller.decision == nil else { tipPanel?.orderOut(nil); return }
        let h = NSScreen.screens.first?.frame.height ?? 0
        let loc = NSEvent.mouseLocation
        let ax = CGPoint(x: loc.x, y: h - loc.y)
        guard let mark = live.marks.first(where: { $0.rect.insetBy(dx: -2, dy: -3).contains(ax) }) else { tipPanel?.orderOut(nil); return }
        let text: String
        switch mark.kind {
        case .secret: text = "This looks like \(Names.kinds[mark.name] ?? Names.types[mark.name] ?? "a secret"). It won't be sent: it becomes \(mark.sentAs ?? "«REMOVED»")."
        case .personal: text = "\(Names.kinds[mark.name] ?? Names.types[mark.name] ?? "Personal detail") · will be sent as \(mark.sentAs ?? "a placeholder")"
        case .warn: text = "Health detail · kept, the AI needs it to answer"
        }
        let view = NSHostingView(rootView: TipView(text: text, kind: mark.kind))
        let size = view.fittingSize
        let origin = ScreenCoords.toCocoa(CGRect(x: mark.rect.minX, y: mark.rect.minY - size.height - 6, width: size.width, height: size.height)).origin
        let tip = tipPanel ?? panel(CGRect(origin: origin, size: size), clickThrough: true)
        tipPanel = tip
        tip.contentView = view
        tip.setFrame(CGRect(origin: origin, size: size), display: true)
        tip.orderFrontRegardless()
    }

    private func show(_ live: LiveMarks?) {
        current = live
        watchPointer(false) // no hover scanning
        guard let live else {
            marksPanel?.orderOut(nil)
            badgePanel?.orderOut(nil)
            return
        }
        // Underlines: one click-through panel over the prompt box (a little taller for the lines).
        let area = live.box.insetBy(dx: -4, dy: -6)
        let cocoaArea = ScreenCoords.toCocoa(area)
        let marks = marksPanel ?? panel(cocoaArea, clickThrough: true)
        marksPanel = marks
        marks.setFrame(cocoaArea, display: true)
        marks.contentView = NSHostingView(rootView: UnderlineView(live: live, origin: area.origin))
        marks.orderOut(nil) // no lines are drawn (by request); the marks only drive the hover tips

        // Badge: just above the top-right corner of the box, where the extension puts its shield.
        let size = CGSize(width: live.count > 0 ? 178 : 34, height: 30)
        let badgeRect = CGRect(x: live.box.maxX - size.width, y: live.box.minY - size.height - 6, width: size.width, height: size.height)
        let badge = badgePanel ?? panel(ScreenCoords.toCocoa(badgeRect), clickThrough: false)
        badgePanel = badge
        badge.setFrame(ScreenCoords.toCocoa(badgeRect), display: true)
        badge.contentView = NSHostingView(rootView: BadgeView(live: live))
        if controller.decision == nil { badge.orderFrontRegardless() }
    }
}

private struct TipView: View {
    let text: String
    let kind: LiveMarks.Kind
    var body: some View {
        Text(text)
            .font(.callout)
            .foregroundStyle(.white)
            .padding(.horizontal, 10).padding(.vertical, 7)
            .background(Color(white: 0.1).opacity(0.95), in: RoundedRectangle(cornerRadius: 8))
            .overlay(alignment: .leading) { Rectangle().fill(kind == .secret ? Color.red : kind == .warn ? .orange : .blue).frame(width: 3) }
            .fixedSize()
    }
}

private struct UnderlineView: View {
    let live: LiveMarks
    let origin: CGPoint
    var body: some View {
        Canvas { ctx, _ in
            for m in live.marks {
                let r = m.rect.offsetBy(dx: -origin.x, dy: -origin.y)
                var path = Path()
                let y = r.maxY + 1
                switch m.kind {
                case .secret: // wavy red
                    path.move(to: CGPoint(x: r.minX, y: y))
                    var x = r.minX
                    var up = true
                    while x < r.maxX { x += 3; path.addLine(to: CGPoint(x: min(x, r.maxX), y: y + (up ? -2 : 1))); up.toggle() }
                    ctx.stroke(path, with: .color(.red), lineWidth: 1.6)
                case .personal:
                    path.move(to: CGPoint(x: r.minX, y: y)); path.addLine(to: CGPoint(x: r.maxX, y: y))
                    ctx.stroke(path, with: .color(Color(red: 0.23, green: 0.51, blue: 0.96)), lineWidth: 2)
                case .warn:
                    path.move(to: CGPoint(x: r.minX, y: y)); path.addLine(to: CGPoint(x: r.maxX, y: y))
                    ctx.stroke(path, with: .color(.orange), style: StrokeStyle(lineWidth: 2, dash: [2, 2]))
                }
            }
        }
        .allowsHitTesting(false)
    }
}

private struct BadgeView: View {
    let live: LiveMarks
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: live.hasSecret ? "exclamationmark.shield.fill" : live.count > 0 ? "shield.lefthalf.filled" : "shield")
                .foregroundStyle(live.count == 0 ? Color.green : live.level.color)
            if live.count > 0 {
                Text(live.hasSecret ? "Secret · won't be sent" : "\(live.count) item\(live.count == 1 ? "" : "s") will be hidden")
                    .font(.caption.weight(.semibold)).lineLimit(1)
            }
        }
        .padding(.horizontal, live.count > 0 ? 10 : 7).padding(.vertical, 5)
        .background(.regularMaterial, in: Capsule())
        .overlay(Capsule().stroke(live.count == 0 ? Color.green.opacity(0.4) : live.level.color.opacity(0.5)))
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
        .help(live.count == 0 ? "MIRAGE is watching this prompt." : "MIRAGE found: " + Set(live.names).sorted().joined(separator: ", ") + ". Nothing is sent until you choose.")
    }
}
