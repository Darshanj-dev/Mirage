// Developer tool for building adapters: `MIRAGE --inspect <bundle-id>` writes the app's
// Accessibility structure to ~/Library/Logs/MIRAGE/ax-<bundle-id>.txt.
// Privacy: it records roles, subroles, identifiers and sizes. Labels are recorded for controls
// only (buttons, text boxes, menus) — never for static text, rows or groups, which carry
// conversation content. For any value it records only its LENGTH, never the text.

import AppKit
import ApplicationServices

public enum Inspector {
    public static func dump(bundleID: String, prepare: ((AXElement) -> Void)? = nil) -> URL? {
        let me = ProcessInfo.processInfo.processIdentifier
        guard let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).first(where: { $0.processIdentifier != me }) else { return nil }
        let app = AXUIElementCreateApplication(running.processIdentifier)
        AXUIElementSetMessagingTimeout(app, 5) // a developer tool can wait; the live gate never does
        prepare?(app)
        // Electron builds its tree after AXManualAccessibility: wait until windows appear (≤ 15 s).
        for _ in 0..<15 where AX.windows(app).isEmpty { Thread.sleep(forTimeInterval: 1) }
        var lines: [String] = ["# \(bundleID) \(running.bundleURL.flatMap { Bundle(url: $0)?.infoDictionary?["CFBundleShortVersionString"] as? String } ?? "")"]
        let focused = AX.focusedElement(of: app)
        var count = 0
        func label(_ el: AXElement) -> String {
            var parts = [AX.role(el) ?? "?"]
            if let s = AX.subrole(el) { parts.append("sub=\(s)") }
            if let i = AX.identifier(el), !i.isEmpty { parts.append("id=\(i)") }
            let controls: Set<String> = [kAXButtonRole, kAXTextAreaRole, kAXTextFieldRole, kAXCheckBoxRole, kAXPopUpButtonRole, kAXMenuButtonRole, kAXRadioButtonRole, kAXWindowRole, "AXWebArea"]
            if controls.contains(parts[0]) {
                for (k, v) in [("title", AX.title(el)), ("desc", AX.descriptionText(el)), ("help", AX.help(el)), ("placeholder", AX.placeholder(el))] {
                    if let v, !v.isEmpty { parts.append("\(k)=\"\(v.prefix(30))\"") } // labels can carry chat titles: keep them short
                }
            }
            if let v = AX.value(el) { parts.append("valueLen=\(v.utf16.count)") }
            if AX.isSettable(el, kAXValueAttribute) { parts.append("settable") }
            if let f = AX.frame(el) { parts.append("frame=\(Int(f.minX)),\(Int(f.minY)),\(Int(f.width))x\(Int(f.height))") }
            if let focused, CFEqual(el, focused) { parts.append("FOCUSED") }
            return parts.joined(separator: " ")
        }
        func walk(_ el: AXElement, _ depth: Int) {
            count += 1
            guard count < 5000, depth < 60 else { return }
            lines.append(String(repeating: "  ", count: depth) + label(el))
            for c in AX.children(el) { walk(c, depth + 1) }
        }
        walk(app, 0)
        // Some apps list windows only under AXWindows, not AXChildren.
        let windows: [AXElement] = AX.attribute(app, kAXWindowsAttribute) ?? []
        lines.append("# AXWindows: \(windows.count)")
        var probe: CFTypeRef?
        for attr in [kAXRoleAttribute, kAXChildrenAttribute, kAXWindowsAttribute, kAXFocusedWindowAttribute, kAXFocusedUIElementAttribute] {
            lines.append("# \(attr) error=\(AXUIElementCopyAttributeValue(app, attr as CFString, &probe).rawValue)")
        }
        let all = NSRunningApplication.runningApplications(withBundleIdentifier: bundleID)
        lines.append("# pids=\(all.map(\.processIdentifier)) trusted=\(AX.isTrusted()) inspectorPid=\(ProcessInfo.processInfo.processIdentifier)")
        for w in windows { walk(w, 1) }
        let dir = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Logs/MIRAGE", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let out = dir.appendingPathComponent("ax-\(bundleID).txt")
        try? lines.joined(separator: "\n").write(to: out, atomically: true, encoding: .utf8)
        return out
    }
}


/// Developer tool: `MIRAGE --selftest-adapter <bundle-id>` checks, on the live app, that MIRAGE can
/// find the prompt box, read it, replace its text and read the replacement back, then restores
/// the original text exactly. It never presses Send. The report holds lengths and results only.
public enum AdapterSelfTest {
    public static func run(bundleID: String) -> [String] {
        guard let adapter = AdapterRegistry.adapter(forBundle: bundleID) else { return ["no adapter for \(bundleID)"] }
        guard let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).first else { return ["\(bundleID) not running"] }
        let app = AXUIElementCreateApplication(running.processIdentifier)
        AXUIElementSetMessagingTimeout(app, 3)
        adapter.prepare(app: app)
        // In real use the app is in front (the user just pressed Return in it).
        running.activate()
        Thread.sleep(forTimeInterval: 0.8)
        var out = ["adapter=\(adapter.displayName) trusted=\(AX.isTrusted()) front=\(NSWorkspace.shared.frontmostApplication?.processIdentifier == running.processIdentifier)"]
        var input: AXElement?
        for _ in 0..<10 {
            input = adapter.inputElement(app: app)
            if input != nil { break }
            Thread.sleep(forTimeInterval: 1)
        }
        guard let input else { return out + ["FAIL input not found"] }
        out.append("input found: role=\(AX.role(input) ?? "?") settable=\(AX.isSettable(input, kAXValueAttribute))")
        let original = adapter.readInput(input) ?? ""
        out.append("read original: \(original.utf16.count) chars, holdsOldProbe=\(original.contains("MIRAGE self-test"))")
        // Unique per run, so a leftover from an earlier run can't make the check pass.
        let probe = "MIRAGE self-test \(UUID().uuidString.prefix(8)): My PAN is «PAN_1» and key «API_KEY_REMOVED»"
        let t0 = CFAbsoluteTimeGetCurrent()
        let result = adapter.replaceInput(input, with: probe)
        let method = (adapter as? TextAreaAdapter)?.lastWriteMethod ?? "?"
        out.append(String(format: "replace+verify: %@ via %@ in %.0f ms", "\(result)", method, (CFAbsoluteTimeGetCurrent() - t0) * 1000))
        let t1 = CFAbsoluteTimeGetCurrent()
        let restored = adapter.replaceInput(input, with: original)
        out.append(String(format: "restore original: %@ via %@ in %.0f ms", "\(restored)", (adapter as? TextAreaAdapter)?.lastWriteMethod ?? "?", (CFAbsoluteTimeGetCurrent() - t1) * 1000))
        Thread.sleep(forTimeInterval: 2) // then check nothing late landed
        let final = adapter.readInput(input) ?? ""
        out.append("2 s later: \(normalizedPromptText(final) == normalizedPromptText(original) ? "original intact" : "CHANGED (\(final.utf16.count) chars)")")
        if let send = adapter.sendControl(app: app, near: input) {
            out.append("send control found: enabled=\(AX.enabled(send))")
        } else {
            out.append("send control: not found near the prompt (label may differ while a reply runs)")
        }
        return out
    }
}


/// `MIRAGE --read-adapter <bundle-id>`: read-only. Reports whether the prompt box holds MIRAGE's
/// self-test text (and its length) without changing anything.
public enum AdapterReadCheck {
    public static func run(bundleID: String) -> [String] {
        guard let adapter = AdapterRegistry.adapter(forBundle: bundleID),
              let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).first else { return ["not running"] }
        let app = AXUIElementCreateApplication(running.processIdentifier)
        AXUIElementSetMessagingTimeout(app, 3)
        guard let input = adapter.inputElement(app: app) else { return ["input not found"] }
        let text = adapter.readInput(input) ?? ""
        return ["length=\(text.utf16.count)", "containsSelfTest=\(text.contains("MIRAGE self-test"))"]
    }
}
