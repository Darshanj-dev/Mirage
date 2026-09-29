// Thin, safe wrapper over the macOS Accessibility API (AXUIElement). Every call has a short
// messaging timeout so a hung app can never freeze MIRAGE, and nothing here logs text.

import AppKit
import ApplicationServices

public typealias AXElement = AXUIElement

public enum AX {
    /// Upper bound for any single call into another app (seconds).
    public static let timeout: Float = 0.25

    /// Caps every call to every app for this process (the default is 6 s). Call once at start.
    public static func setGlobalTimeout(_ seconds: Float = 0.5) {
        AXUIElementSetMessagingTimeout(AXUIElementCreateSystemWide(), seconds)
    }

    public static func app(pid: pid_t) -> AXElement {
        let el = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(el, timeout)
        return el
    }

    public static func attribute<T>(_ el: AXElement, _ name: String) -> T? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(el, name as CFString, &value) == .success else { return nil }
        return value as? T
    }

    public static func string(_ el: AXElement, _ name: String) -> String? { attribute(el, name) }
    public static func role(_ el: AXElement) -> String? { string(el, kAXRoleAttribute) }
    public static func subrole(_ el: AXElement) -> String? { string(el, kAXSubroleAttribute) }
    public static func identifier(_ el: AXElement) -> String? { string(el, kAXIdentifierAttribute) }
    public static func title(_ el: AXElement) -> String? { string(el, kAXTitleAttribute) }
    public static func help(_ el: AXElement) -> String? { string(el, kAXHelpAttribute) }
    public static func descriptionText(_ el: AXElement) -> String? { string(el, kAXDescriptionAttribute) }
    public static func placeholder(_ el: AXElement) -> String? { string(el, kAXPlaceholderValueAttribute) }
    public static func value(_ el: AXElement) -> String? { string(el, kAXValueAttribute) }
    public static func enabled(_ el: AXElement) -> Bool { attribute(el, kAXEnabledAttribute) ?? true }
    public static func children(_ el: AXElement) -> [AXElement] { attribute(el, kAXChildrenAttribute) ?? [] }
    public static func windows(_ app: AXElement) -> [AXElement] { attribute(app, kAXWindowsAttribute) ?? [] }
    public static func parent(_ el: AXElement) -> AXElement? {
        guard let v: CFTypeRef = attribute(el, kAXParentAttribute), CFGetTypeID(v) == AXUIElementGetTypeID() else { return nil }
        return (v as! AXElement)
    }

    public static func focusedElement(of app: AXElement) -> AXElement? {
        guard let v: CFTypeRef = attribute(app, kAXFocusedUIElementAttribute), CFGetTypeID(v) == AXUIElementGetTypeID() else { return nil }
        return (v as! AXElement)
    }

    public static func frame(_ el: AXElement) -> CGRect? {
        guard let posV: CFTypeRef = attribute(el, kAXPositionAttribute), let sizeV: CFTypeRef = attribute(el, kAXSizeAttribute) else { return nil }
        var p = CGPoint.zero, s = CGSize.zero
        guard AXValueGetValue(posV as! AXValue, .cgPoint, &p), AXValueGetValue(sizeV as! AXValue, .cgSize, &s) else { return nil }
        return CGRect(origin: p, size: s)
    }

    /// The element under a screen point (top-left origin), from the system-wide element.
    public static func element(at point: CGPoint) -> AXElement? {
        let system = AXUIElementCreateSystemWide()
        AXUIElementSetMessagingTimeout(system, timeout)
        var el: AXUIElement?
        guard AXUIElementCopyElementAtPosition(system, Float(point.x), Float(point.y), &el) == .success else { return nil }
        return el
    }

    public static func pid(_ el: AXElement) -> pid_t? {
        var pid: pid_t = 0
        return AXUIElementGetPid(el, &pid) == .success ? pid : nil
    }

    @discardableResult
    public static func set(_ el: AXElement, _ name: String, _ value: CFTypeRef) -> Bool {
        AXUIElementSetAttributeValue(el, name as CFString, value) == .success
    }

    public static func isSettable(_ el: AXElement, _ name: String) -> Bool {
        var settable: DarwinBoolean = false
        return AXUIElementIsAttributeSettable(el, name as CFString, &settable) == .success && settable.boolValue
    }

    @discardableResult
    public static func press(_ el: AXElement) -> Bool {
        AXUIElementPerformAction(el, kAXPressAction as CFString) == .success
    }

    /// Depth-first search, bounded so a huge tree (a long chat) can never stall MIRAGE.
    public static func find(in root: AXElement, maxDepth: Int = 40, maxNodes: Int = 4000, where match: (AXElement) -> Bool) -> AXElement? {
        var visited = 0
        func walk(_ el: AXElement, _ depth: Int) -> AXElement? {
            visited += 1
            if visited > maxNodes || depth > maxDepth { return nil }
            if match(el) { return el }
            for child in children(el) { if let hit = walk(child, depth + 1) { return hit } }
            return nil
        }
        return walk(root, 0)
    }

    public static func findAll(in root: AXElement, maxDepth: Int = 40, maxNodes: Int = 6000, where match: (AXElement) -> Bool) -> [AXElement] {
        var visited = 0
        var out: [AXElement] = []
        func walk(_ el: AXElement, _ depth: Int) {
            visited += 1
            if visited > maxNodes || depth > maxDepth { return }
            if match(el) { out.append(el) }
            for child in children(el) { walk(child, depth + 1) }
        }
        walk(root, 0)
        return out
    }

    /// True if `el` is `ancestor` or inside it.
    public static func isDescendant(_ el: AXElement, of ancestor: AXElement, maxDepth: Int = 60) -> Bool {
        var current: AXElement? = el
        for _ in 0..<maxDepth {
            guard let c = current else { return false }
            if CFEqual(c, ancestor) { return true }
            current = parent(c)
        }
        return false
    }

    public static func isTrusted() -> Bool { AXIsProcessTrusted() }
}

/// Text as MIRAGE compares it: line endings and odd spaces normalized, trailing space ignored.
public func normalizedPromptText(_ s: String) -> String {
    s.replacingOccurrences(of: "\r\n", with: "\n")
        .replacingOccurrences(of: "\r", with: "\n")
        .replacingOccurrences(of: "\u{00A0}", with: " ")
        .replacingOccurrences(of: "\u{FFFC}", with: "")
        .trimmingCharacters(in: .whitespacesAndNewlines)
}
