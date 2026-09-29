// Developer tool: `MIRAGE --e2e <bundle-id> [protect|cancel]` runs the real protection flow on a
// live app, as a user would, against the MIRAGE instance already running:
//   1. write a fictional demo prompt into the app's prompt box and press Return (a real key event)
//   2. check the running MIRAGE held it: its decision panel is open and the prompt is still unsent
//   3. press "Protect & Send" (or "Cancel") in MIRAGE's own panel, through Accessibility
//   4. check the outcome in the app: placeholders sent and no raw value in the conversation,
//      or (cancel) the prompt untouched and nothing sent.
// The report holds results only, never prompt text beyond the fictional demo values' presence.

import AppKit
import ApplicationServices

public enum EndToEnd {
    static let awsId = ["AKIA", "Q7Z3", "MIRAGEDEMO", "42"].joined()
    static let raw = [awsId, "BNZPM2501K", "priya.demo@example.com", "rahul.sharma.demo@example.com", "S3cr3tPass", "98765 43210"]
    static let shortPrompt = "I'm debugging my production server. AWS_ACCESS_KEY_ID=\(awsId) My PAN is BNZPM2501K. My email is priya.demo@example.com. Reply with one word: ok."
    /// Like the prompt a user reported (long, many items), with fictional values.
    static let longPrompt = """
    I'm preparing a professional profile and onboarding document for a new employee.

    Employee details:
    Name: Rahul Sharma
    Date of Birth: 14 March 2002
    PAN: BNZPM2501K
    Phone: +91 98765 43210
    Personal Email: rahul.sharma.demo@example.com
    Address: Flat 402, Green Valley Apartments, 24th Main Road, Bengaluru, Karnataka 560064

    Employment information:
    Company: Nexora Technologies Pvt. Ltd.
    Work Email: rahul.sharma@nexora-demo.example
    AWS_ACCESS_KEY_ID=\(awsId)
    DATABASE_URL=postgres://admin:S3cr3tPass@db.internal:5432/prod
    Please write a short welcome note. Reply with one word: ok.
    """
    static var prompt = shortPrompt

    /// A clean prompt that asks the AI to invent a key-shaped string: tests the reply check.
    static let replyPrompt = "Invent one example AWS access key ID for a tutorial: the letters AKIA followed by 16 random uppercase letters and digits. Reply with only that ID."

    public static func run(bundleID: String, action: String) -> [String] {
        prompt = action.hasPrefix("long") ? longPrompt : shortPrompt
        if action == "compose" { return compose(bundleID: bundleID) }
        if action == "live" { return liveMarks(bundleID: bundleID) }
        guard let adapter = AdapterRegistry.adapter(forBundle: bundleID),
              let target = NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).first else { return ["FAIL \(bundleID) not running"] }
        guard let mirage = NSRunningApplication.runningApplications(withBundleIdentifier: "dev.mirage.desktop")
            .first(where: { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }) else { return ["FAIL main MIRAGE not running"] }
        var out = ["target=\(adapter.displayName) action=\(action)"]
        let app = AXUIElementCreateApplication(target.processIdentifier)
        AXUIElementSetMessagingTimeout(app, 3)
        adapter.prepare(app: app)
        target.activate()
        Thread.sleep(forTimeInterval: 1)
        guard let input = adapter.inputElement(app: app) else { return out + ["FAIL input not found"] }
        let original = adapter.readInput(input) ?? ""
        if action == "reply" {
            guard adapter.replaceInput(input, with: replyPrompt) == .verified else { return out + ["FAIL could not type the prompt"] }
            AX.set(input, kAXFocusedAttribute, kCFBooleanTrue)
            Thread.sleep(forTimeInterval: 0.4)
            for down in [true, false] {
                CGEvent(keyboardEventSource: CGEventSource(stateID: .hidSystemState), virtualKey: 36, keyDown: down)?.post(tap: .cghidEventTap)
            }
            let status = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Logs/MIRAGE/debug/status.txt")
            for i in 0..<45 {
                Thread.sleep(forTimeInterval: 1)
                DistributedNotificationCenter.default().postNotificationName(.init("dev.mirage.debug.capture"), object: nil, userInfo: nil, deliverImmediately: true)
                Thread.sleep(forTimeInterval: 0.2)
                let text = (try? String(contentsOf: status, encoding: .utf8)) ?? ""
                if let line = text.split(separator: "\n").first(where: { $0.hasPrefix("replyAlert=") }), !line.hasSuffix("none") {
                    return out + ["clean prompt sent (not held): \(!text.contains("decisionOpen=true"))", "reply alert after ~\(i + 1) s: \(line)"]
                }
            }
            return out + ["no reply alert within 45 s"]
        }
        guard adapter.replaceInput(input, with: prompt) == .verified else {
            let got = normalizedPromptText(adapter.readInput(input) ?? "")
            let want = normalizedPromptText(prompt)
            let common = zip(got, want).prefix { $0 == $1 }.count
            return out + ["FAIL could not type the demo prompt: box \(got.count) chars vs \(want.count) wanted, identical for the first \(common)",
                          "  differs at: got …\(got.dropFirst(max(0, common - 10)).prefix(40))… want …\(want.dropFirst(max(0, common - 10)).prefix(40))…"]
        }
        AX.set(input, kAXFocusedAttribute, kCFBooleanTrue)
        Thread.sleep(forTimeInterval: 0.4)

        // 1. Send as a user would: Return, or (click-*) a real mouse click on the app's Send button.
        let t0 = Date()
        if action.hasPrefix("click") {
            guard let send = adapter.sendControl(app: app, near: input), let f = AX.frame(send) else {
                _ = adapter.replaceInput(input, with: original)
                return out + ["FAIL send button not found to click"]
            }
            let p = CGPoint(x: f.midX, y: f.midY)
            out.append("clicking the app's Send button")
            let src = CGEventSource(stateID: .hidSystemState)
            CGEvent(mouseEventSource: src, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
            usleep(150_000)
            CGEvent(mouseEventSource: src, mouseType: .leftMouseDown, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
            usleep(60_000)
            CGEvent(mouseEventSource: src, mouseType: .leftMouseUp, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
        } else {
            for down in [true, false] {
                CGEvent(keyboardEventSource: CGEventSource(stateID: .hidSystemState), virtualKey: 36, keyDown: down)?.post(tap: .cghidEventTap)
            }
        }
        // 2. Ask the running MIRAGE (started with --debug-hooks) whether it holds a decision.
        let status = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Logs/MIRAGE/debug/status.txt")
        var open = false
        var statusText = ""
        for _ in 0..<50 {
            try? FileManager.default.removeItem(at: status)
            DistributedNotificationCenter.default().postNotificationName(.init("dev.mirage.debug.capture"), object: nil, userInfo: nil, deliverImmediately: true)
            Thread.sleep(forTimeInterval: 0.1)
            statusText = (try? String(contentsOf: status, encoding: .utf8)) ?? ""
            if statusText.contains("decisionOpen=true") { open = true; break }
        }
        guard open else {
            let texts = conversationText(app: app, excluding: input)
            let box = adapter.readInput(input) ?? ""
            return out + ["FAIL MIRAGE holds no decision within 5 s",
                          "box still holds the demo prompt: \(normalizedPromptText(box) == normalizedPromptText(prompt))",
                          "raw values in conversation now: \(raw.filter { texts.contains($0) }.count)"]
        }
        out.append(String(format: "decision open after %.0f ms (seen by the driver)", Date().timeIntervalSince(t0) * 1000))
        out += statusText.split(separator: "\n").filter { $0.hasPrefix("gateCheckMs") }.map(String.init)
        let held = normalizedPromptText(adapter.readInput(input) ?? "") == normalizedPromptText(prompt)
        out.append("prompt still in the box, unsent: \(held)")

        // 3. The user's choice (the same call the panel's button makes).
        let choice = action.hasSuffix("cancel") ? "cancel" : "protect"
        DistributedNotificationCenter.default().postNotificationName(.init("dev.mirage.debug.decide"), object: choice, userInfo: nil, deliverImmediately: true)
        if !action.hasSuffix("cancel") {
            // Trace the send: what the box holds every 500 ms (lengths and flags only).
            for i in 0..<12 {
                Thread.sleep(forTimeInterval: 0.5)
                let v = adapter.readInput(input) ?? ""
                out.append("t+\(Double(i + 1) * 0.5)s box=\(v.utf16.count) protected=\(v.contains("REMOVED")) raw=\(raw.contains { v.contains($0) })")
                if v.utf16.count < 20 && i > 1 { break }
            }
        }
        Thread.sleep(forTimeInterval: action.hasSuffix("cancel") ? 1.5 : 3)

        // 4. Outcome in the app.
        let box = adapter.readInput(input) ?? ""
        let texts = conversationText(app: app, excluding: input)
        let rawInConversation = raw.filter { texts.contains($0) }
        if action.hasSuffix("cancel") {
            out.append("after cancel, prompt untouched: \(normalizedPromptText(box) == normalizedPromptText(prompt))")
            out.append("raw values in conversation: \(rawInConversation.count)")
            _ = adapter.replaceInput(input, with: original)
            out.append("original text put back: \(normalizedPromptText(adapter.readInput(input) ?? "") == normalizedPromptText(original))")
        } else {
            out.append("placeholders in conversation: \(texts.contains("AWS_ACCESS_KEY_REMOVED") && texts.contains("«PAN_1»"))")
            out.append("raw values in conversation: \(rawInConversation.count)")
            out += texts.split(separator: "\n").filter { l in raw.contains { l.contains($0) } || l.contains("REMOVED") || l.contains("«") }
                .map { "  line: " + $0.prefix(150) } // fictional demo data only
            out.append("box after send: \(box.utf16.count) chars")
        }
        return out
    }

    /// Read-only: what the conversation shows (placeholders present, raw demo values present).
    public static func checkConversation(bundleID: String) -> [String] {
        guard let adapter = AdapterRegistry.adapter(forBundle: bundleID),
              let target = NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).first else { return ["not running"] }
        let app = AXUIElementCreateApplication(target.processIdentifier)
        AXUIElementSetMessagingTimeout(app, 3)
        guard let input = adapter.inputElement(app: app) else { return ["input not found"] }
        let texts = conversationText(app: app, excluding: input)
        return [
            "AWS_ACCESS_KEY_REMOVED in conversation: \(texts.contains("AWS_ACCESS_KEY_REMOVED"))",
            "«PAN_1» in conversation: \(texts.contains("«PAN_1»")) · «EMAIL_1»: \(texts.contains("«EMAIL_1»"))",
            "raw demo values in conversation: \(raw.filter { texts.contains($0) }.count) of \(raw.count)",
            "AKIA-shaped strings in conversation: \(texts.components(separatedBy: "AKIA").count - 1)",
            "latestReply length: \(adapter.latestReply(app: app)?.count ?? -1)",
        ] + texts.split(separator: "\n").filter { l in raw.contains { l.contains($0) } || l.contains("REMOVED") || l.contains("«") }
            .map { "  line: " + $0.prefix(140) } // fictional demo data only
    }

    /// Text of the app's window outside the prompt box (to check what was sent).
    static func conversationText(app: AXElement, excluding input: AXElement) -> String {
        // The prompt box's own text runs are static texts too: leave them out.
        let inBox = AX.findAll(in: input, maxDepth: 20, maxNodes: 2000, where: { AX.role($0) == kAXStaticTextRole })
        var parts: [String] = []
        for w in AX.windows(app) {
            for el in AX.findAll(in: w, maxDepth: 60, maxNodes: 30000, where: { AX.role($0) == kAXStaticTextRole })
            where !inBox.contains(where: { CFEqual($0, el) }) {
                if let v = AX.value(el) { parts.append(v) }
            }
        }
        return parts.joined(separator: "\n")
    }
}


extension EndToEnd {
    /// Private Compose on the live app: the running MIRAGE (with --debug-hooks) inserts the long
    /// fictional prompt from its own window; the driver checks the app's box holds only the
    /// protected text, presses Return as a user would, and checks what the app sent.
    static func compose(bundleID: String) -> [String] {
        guard let adapter = AdapterRegistry.adapter(forBundle: bundleID),
              let target = NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).first else { return ["FAIL not running"] }
        let app = AXUIElementCreateApplication(target.processIdentifier)
        AXUIElementSetMessagingTimeout(app, 3)
        adapter.prepare(app: app)
        var out = ["target=\(adapter.displayName) action=compose (long prompt, \(longPrompt.count) chars)"]
        let before = raw.filter { conversationText(app: app, excluding: app).contains($0) }.count
        DistributedNotificationCenter.default().postNotificationName(.init("dev.mirage.debug.compose"), object: longPrompt, userInfo: nil, deliverImmediately: true)
        Thread.sleep(forTimeInterval: 8)
        guard let input = adapter.inputElement(app: app) else { return out + ["FAIL input not found"] }
        let box = adapter.readInput(input) ?? ""
        out.append("box holds protected text: \(box.contains("AWS_ACCESS_KEY_REMOVED") && box.contains("«PAN_1»")), raw values in box: \(raw.filter { box.contains($0) }.count)")
        target.activate()
        Thread.sleep(forTimeInterval: 0.5)
        AX.set(input, kAXFocusedAttribute, kCFBooleanTrue)
        Thread.sleep(forTimeInterval: 0.3)
        for down in [true, false] { CGEvent(keyboardEventSource: CGEventSource(stateID: .hidSystemState), virtualKey: 36, keyDown: down)?.post(tap: .cghidEventTap) }
        Thread.sleep(forTimeInterval: 8)
        let texts = conversationText(app: app, excluding: input)
        out.append("sent (box emptied): \(normalizedPromptText(adapter.readInput(input) ?? "").count < 20)")
        out.append("placeholders in conversation: \(texts.contains("AWS_ACCESS_KEY_REMOVED"))")
        out.append("raw values in conversation: before \(before), after \(raw.filter { texts.contains($0) }.count)")
        return out
    }
}


extension EndToEnd {
    /// Puts the long prompt in the box (no send), lets MIRAGE draw its badge and underlines, reads
    /// what it drew from the running MIRAGE's status, then puts the original text back.
    static func liveMarks(bundleID: String) -> [String] {
        guard let adapter = AdapterRegistry.adapter(forBundle: bundleID),
              let target = NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).first else { return ["FAIL not running"] }
        let app = AXUIElementCreateApplication(target.processIdentifier)
        AXUIElementSetMessagingTimeout(app, 3)
        adapter.prepare(app: app)
        target.activate()
        Thread.sleep(forTimeInterval: 1)
        guard let input = adapter.inputElement(app: app) else { return ["FAIL input not found"] }
        let original = adapter.readInput(input) ?? ""
        guard adapter.replaceInput(input, with: longPrompt) == .verified else { return ["FAIL could not put the prompt in the box"] }
        Thread.sleep(forTimeInterval: 2)
        let status = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Logs/MIRAGE/debug/status.txt")
        DistributedNotificationCenter.default().postNotificationName(.init("dev.mirage.debug.capture"), object: nil, userInfo: nil, deliverImmediately: true)
        Thread.sleep(forTimeInterval: 0.5)
        let line = ((try? String(contentsOf: status, encoding: .utf8)) ?? "").split(separator: "\n").first { $0.hasPrefix("live=") }.map(String.init) ?? "live=?"
        _ = adapter.replaceInput(input, with: original)
        return ["target=\(adapter.displayName) action=live", line, "prompt box frame (AX): \(AX.frame(input).map { "\(Int($0.minX)),\(Int($0.minY)) \(Int($0.width))x\(Int($0.height))" } ?? "?")"]
    }
}
