// Application adapters: everything MIRAGE knows about one AI desktop app. The protection logic
// (ProtectionController) is the same for every app; only adapters know an app's structure, so an
// app update is a one-file fix.

import AppKit
import ApplicationServices

public enum AppID: String, Codable, CaseIterable, Sendable {
    case chatgpt, claude, gemini, copilot, perplexity
}

/// How far an adapter has been proven on the live app.
public enum AdapterStatus: Equatable, Sendable {
    /// Send interception, replacement and verification tested on the named app version.
    case verified(version: String, date: String)
    /// Structure mapped but the full protect flow not yet proven: MIRAGE only checks and warns.
    case checkingOnly
    /// Not implemented: shown as "Unsupported AI application", never as protected.
    case unsupported
}

public enum ReplaceResult: Equatable, Sendable {
    case verified
    case mismatch // wrote, but the box now reads something else
    case notSupported // the app refused every write strategy
}

public protocol DesktopAIAdapter: AnyObject {
    var id: AppID { get }
    var displayName: String { get }
    var bundleIdentifiers: [String] { get }
    var status: AdapterStatus { get }

    /// Called once per app launch before anything else (e.g. Electron: turn on its AX tree).
    func prepare(app: AXElement)
    /// True if `element` is this app's prompt box.
    func isInput(_ element: AXElement) -> Bool
    /// The prompt box, from the focused element or a bounded search of the front window.
    func inputElement(app: AXElement) -> AXElement?
    /// True if `element` (e.g. under a click) is the control that sends the prompt.
    func isSendControl(_ element: AXElement) -> Bool
    func sendControl(app: AXElement, near input: AXElement) -> AXElement?
    func readInput(_ input: AXElement) -> String?
    /// Writes `text` into the prompt box and reads it back. Never assumes success.
    func replaceInput(_ input: AXElement, with text: String) -> ReplaceResult
    /// Sends what is in the box: press the send control, or post Return (marked as MIRAGE's own).
    func submit(app: AXElement, input: AXElement) -> Bool
    /// The newest AI reply's text, for the reply check.
    func latestReply(app: AXElement) -> String?
}

/// Behaviour shared by adapters for apps whose prompt box is a standard text area.
open class TextAreaAdapter: DesktopAIAdapter {
    open var id: AppID { fatalError("override") }
    open var displayName: String { fatalError("override") }
    open var bundleIdentifiers: [String] { [] }
    open var status: AdapterStatus { .unsupported }

    public init() {}

    open func prepare(app: AXElement) {}

    open func isInput(_ element: AXElement) -> Bool {
        AX.role(element) == kAXTextAreaRole && AX.isSettable(element, kAXValueAttribute)
    }

    open func inputElement(app: AXElement) -> AXElement? {
        if let focused = AX.focusedElement(of: app), isInput(focused) { return focused }
        // Some apps (Electron) list windows only under AXWindows, not as children: search the
        // focused window first, then the rest. Bounded, so a long chat can't stall the search.
        var windows = AX.windows(app)
        if let fw: CFTypeRef = AX.attribute(app, kAXFocusedWindowAttribute), CFGetTypeID(fw) == AXUIElementGetTypeID() {
            windows.insert(fw as! AXElement, at: 0)
        }
        for w in windows {
            if let hit = AX.find(in: w, maxDepth: 45, maxNodes: 12000, where: { self.isInput($0) }) { return hit }
        }
        return nil
    }

    open func isSendControl(_ element: AXElement) -> Bool { false }

    /// The send control near the prompt box: climb up to 6 levels, looking a few levels down at
    /// each (≤ 60 elements per level), so it costs tens of calls, not hundreds.
    open func sendControl(app: AXElement, near input: AXElement) -> AXElement? {
        var scope: AXElement? = AX.parent(input)
        for _ in 0..<6 {
            guard let s = scope else { break }
            if let hit = AX.find(in: s, maxDepth: 3, maxNodes: 60, where: { self.isSendControl($0) }) { return hit }
            scope = AX.parent(s)
        }
        return nil
    }

    open func readInput(_ input: AXElement) -> String? { AX.value(input) }

    /// Waits until the box has stopped changing, then reports whether it shows `want`.
    /// Editors like Electron's apply writes asynchronously; deciding before the box settles lets a
    /// late write land after MIRAGE has moved on (seen live on ChatGPT 26.924). A result counts
    /// only once three reads 120 ms apart agree. Gives up after `timeout`.
    public func settles(_ input: AXElement, to want: String, timeout: TimeInterval = 2.0) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        var last: String?
        var stable = 0
        repeat {
            let now = normalizedPromptText(readInput(input) ?? "")
            if now == last { stable += 1 } else { stable = 0; last = now }
            if stable >= 2 { return now == want }
            Thread.sleep(forTimeInterval: 0.08) // callers run this off the main thread
        } while Date() < deadline
        return false
    }

    /// Electron editors accept "replace the selection" but not "set the value": try that first.
    open var prefersSelectionReplace: Bool { false }
    /// Write by typing (keyboard input) instead of setting the value: for editors whose send uses
    /// their own internal copy of the text rather than what is displayed.
    open var typesText: Bool { false }
    /// Send with a Return key press (MIRAGE's own, marked) rather than pressing the send button.
    open var submitsWithReturn: Bool { false }
    /// Which write method worked last (diagnostics for the self-test; never text).
    public private(set) var lastWriteMethod = "none"

    /// Writes `text` with one method at a time, each verified once the box has settled.
    open func replaceInput(_ input: AXElement, with text: String) -> ReplaceResult {
        let want = normalizedPromptText(text)
        if settles(input, to: want, timeout: 0.6) { lastWriteMethod = "already"; return .verified }
        var wrote = false
        let setValue = { () -> Bool in
            guard AX.isSettable(input, kAXValueAttribute), AX.set(input, kAXValueAttribute, text as CFString) else { return false }
            wrote = true
            return self.settles(input, to: want)
        }
        let replaceSelection = { () -> Bool in
            var range = CFRange(location: 0, length: (self.readInput(input) ?? "").utf16.count)
            guard let rangeValue = AXValueCreate(.cfRange, &range),
                  AX.set(input, kAXSelectedTextRangeAttribute, rangeValue),
                  AX.set(input, kAXSelectedTextAttribute, text as CFString) else { return false }
            wrote = true
            return self.settles(input, to: want)
        }
        // Typed: select all and type the text as keyboard input, like a person. It goes through the
        // editor's own input path, so editors that keep an internal copy of the text (Electron)
        // update it too; writing the value only changes what is displayed.
        let typed = { () -> Bool in
            guard let pid = AX.pid(input) else { return false }
            AX.set(input, kAXFocusedAttribute, kCFBooleanTrue)
            wrote = true
            guard KeyPoster.selectAll(to: pid) else { return false }
            // A blank box is restored by deleting, not by typing its line breaks back in.
            let typedOK = want.isEmpty ? KeyPoster.deleteSelection(to: pid) : KeyPoster.type(text.trimmingCharacters(in: .newlines), to: pid)
            guard typedOK else { return false }
            return self.settles(input, to: want)
        }
        let strategies = typesText ? [("typed", typed)] :
            prefersSelectionReplace ? [("selection", replaceSelection), ("value", setValue)] : [("value", setValue), ("selection", replaceSelection)]
        for (name, attempt) in strategies where attempt() {
            lastWriteMethod = name
            return .verified
        }
        lastWriteMethod = "none"
        return wrote ? .mismatch : .notSupported
    }

    open func submit(app: AXElement, input: AXElement) -> Bool {
        if submitsWithReturn {
            AX.set(input, kAXFocusedAttribute, kCFBooleanTrue)
            return KeyPoster.postReturn(to: AX.pid(app))
        }
        if let send = sendControl(app: app, near: input), AX.enabled(send), AX.press(send) { return true }
        return KeyPoster.postReturn(to: AX.pid(app))
    }

    /// The conversation's text (outside the prompt box), newest last, capped. The reply check
    /// compares it before and after a send, so only what the AI newly wrote is checked.
    open func latestReply(app: AXElement) -> String? {
        var windows = AX.windows(app)
        if let fw: CFTypeRef = AX.attribute(app, kAXFocusedWindowAttribute), CFGetTypeID(fw) == AXUIElementGetTypeID() { windows = [fw as! AXElement] }
        guard let window = windows.first else { return nil }
        let input = inputElement(app: app)
        let boxTexts = input.map { AX.findAll(in: $0, maxDepth: 15, maxNodes: 500) { AX.role($0) == kAXStaticTextRole } } ?? []
        let texts = AX.findAll(in: window, maxDepth: 60, maxNodes: 8000) { AX.role($0) == kAXStaticTextRole }
            .filter { el in !boxTexts.contains { CFEqual($0, el) } }
            .compactMap(AX.value)
        let joined = texts.joined(separator: "\n")
        return joined.count > 20_000 ? String(joined.suffix(20_000)) : joined
    }
}

/// Posts a Return key press marked as MIRAGE's own, so the submit gate lets it through.
public enum KeyPoster {
    public static let marker: Int64 = 0x4D49_5241 // "MIRA"

    private static func post(_ events: [CGEvent], to pid: pid_t) {
        for e in events {
            e.setIntegerValueField(.eventSourceUserData, value: marker)
            e.postToPid(pid)
        }
    }

    public static func postReturn(to pid: pid_t?) -> Bool {
        guard let pid,
              let down = CGEvent(keyboardEventSource: nil, virtualKey: 36, keyDown: true),
              let up = CGEvent(keyboardEventSource: nil, virtualKey: 36, keyDown: false) else { return false }
        post([down, up], to: pid)
        return true
    }

    /// Delete (backspace) the current selection.
    public static func deleteSelection(to pid: pid_t) -> Bool {
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 51, keyDown: true),
              let up = CGEvent(keyboardEventSource: nil, virtualKey: 51, keyDown: false) else { return false }
        post([down, up], to: pid)
        return true
    }

    /// Command-A in the focused field.
    public static func selectAll(to pid: pid_t) -> Bool {
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
              let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false) else { return false }
        down.flags = .maskCommand
        up.flags = .maskCommand
        post([down, up], to: pid)
        usleep(60_000)
        return true
    }

    /// Types `text` as keyboard input, 16 characters per event (the most one event carries).
    /// Line breaks are typed as Shift-Return, so they never send the message half-way.
    public static func type(_ text: String, to pid: pid_t) -> Bool {
        for (i, line) in text.components(separatedBy: "\n").enumerated() {
            if i > 0 {
                guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 36, keyDown: true),
                      let up = CGEvent(keyboardEventSource: nil, virtualKey: 36, keyDown: false) else { return false }
                down.flags = .maskShift
                up.flags = .maskShift
                post([down, up], to: pid)
            }
            var units = Array(line.utf16)
            while !units.isEmpty {
                let chunk = Array(units.prefix(16))
                units.removeFirst(chunk.count)
                guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
                      let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false) else { return false }
                down.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: chunk)
                up.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: chunk)
                post([down, up], to: pid)
                usleep(4_000)
            }
        }
        return true
    }
}

public enum AdapterRegistry {
    public static let all: [DesktopAIAdapter] = [ChatGPTAdapter(), ClaudeAdapter()]

    public static func adapter(forBundle id: String?) -> DesktopAIAdapter? {
        guard let id else { return nil }
        return all.first { $0.bundleIdentifiers.contains(id) }
    }

    /// Known AI apps MIRAGE does not protect yet: shown as "Unsupported AI application".
    public static let knownUnsupported: [String: String] = [
        "com.google.GeminiMacOS": "Gemini",
        "com.microsoft.copilot-mac": "Microsoft Copilot",
        "ai.perplexity.mac": "Perplexity",
    ]
}
