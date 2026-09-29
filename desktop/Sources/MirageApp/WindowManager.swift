// MIRAGE's windows (welcome, dashboard, permissions), managed directly with AppKit: reliable for
// a menu-bar app, which has no Dock icon and no main window.

import AppKit
import MirageAgent
import SwiftUI

@MainActor
final class WindowManager {
    enum Kind { case onboarding, dashboard, permissions }
    private let controller: ProtectionController
    private var windows: [Kind: NSWindow] = [:]

    init(controller: ProtectionController) { self.controller = controller }

    func show(_ kind: Kind) {
        let window = windows[kind] ?? make(kind)
        windows[kind] = window
        if !window.isVisible { window.center() }
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        // Also in front when another app is full-screen or MIRAGE isn't active yet.
        window.orderFrontRegardless()
    }

    func close(_ kind: Kind) { windows[kind]?.close() }

    private func make(_ kind: Kind) -> NSWindow {
        let view: AnyView
        let title: String
        switch kind {
        case .onboarding:
            title = "Welcome to MIRAGE"
            view = AnyView(OnboardingView(controller: controller, permissions: controller.permissions) { [weak self] in self?.close(.onboarding) })
        case .dashboard:
            title = "MIRAGE Dashboard"
            view = AnyView(DashboardView(controller: controller))
        case .permissions:
            title = "MIRAGE Permissions"
            view = AnyView(PermissionsPane(permissions: controller.permissions).frame(width: 460, height: 320))
        }
        let window = NSWindow(contentViewController: NSHostingController(rootView: view))
        window.title = title
        window.styleMask = kind == .dashboard ? [.titled, .closable, .miniaturizable, .resizable] : [.titled, .closable]
        window.isReleasedWhenClosed = false
        // Open on the Space the user is looking at (e.g. over a full-screen app), not on another one.
        window.collectionBehavior = [.moveToActiveSpace, .fullScreenAuxiliary]
        return window
    }
}
