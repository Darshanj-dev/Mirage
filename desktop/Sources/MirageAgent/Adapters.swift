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

    /// Any editable text box: a settable text area or text field.
    public static func isEditable(_ el: AXElement) -> Bool {
        let role = AX.role(el)
        return (role == kAXTextAreaRole || role == kAXTextFieldRole) && AX.isSettable(el, kAXValueAttribute)
    }

    /// The box the user is typing in: the focused element, or the editable box it sits inside
    /// (apps sometimes report focus on a part of the box). Any editable box counts, whatever its
    /// label: the label differs between app views ("Do anything", "Ask anything", "Message …"),
    /// and a label mismatch once made MIRAGE check an empty box and let a send through.
    open func focusedBox(app: AXElement) -> AXElement? {
        guard var el = AX.focusedElement(of: app) else { return nil }
        for _ in 0..<8 {
            if isInput(el) || Self.isEditable(el) { return el }
            guard let up = AX.parent(el) else { return nil }
            el = up
        }
        return nil
    }

    open func inputElement(app: AXElement) -> AXElement? {
        if let box = focusedBox(app: app) { return box }
        // Some apps (Electron) list windows only under AXWindows, not as children: search the
        // focused window first, then the rest. Bounded, so a long chat can't stall the search.
        var windows = AX.windows(app)
        if let fw: CFTypeRef = AX.attribute(app, kAXFocusedWindowAttribute), CFGetTypeID(fw) == AXUIElementGetTypeID() {
            windows.insert(fw as! AXElement, at: 0)
        }
        var empty: AXElement?
        for w in windows {
            for hit in AX.findAll(in: w, maxDepth: 45, maxNodes: 12000, where: { self.isInput($0) || Self.isEditable($0) }) {
                if !normalizedPromptText(readInput(hit) ?? "").isEmpty && !isPlaceholderOnly(hit) { return hit }
                empty = empty ?? hit
            }
        }
        return empty
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

    /// An empty box can report its placeholder as its value ("Do anything").
    func isPlaceholderOnly(_ el: AXElement) -> Bool {
        let v = normalizedPromptText(readInput(el) ?? "")
        return !v.isEmpty && [AX.placeholder(el), AX.title(el), AX.descriptionText(el)].compactMap { $0 }.contains { normalizedPromptText($0) == v }
    }

    /// Reports whether the box shows `want`, waiting for the app to catch up.
    /// Apps process typed text at their own pace (ChatGPT on a long prompt: a few hundred
    /// characters per second), and some apply writes late. So: true as soon as the box matches;
    /// false only when it has not changed for 600 ms and still differs, or the time is up.
    /// The time allowed grows with the length of the text.
    public func settles(_ input: AXElement, to want: String, timeout: TimeInterval = 2.0) -> Bool {
        let deadline = Date().addingTimeInterval(timeout + Double(want.count) / 150)
        var last: String?
        var unchangedSince = Date()
        repeat {
            let now = normalizedPromptText(readInput(input) ?? "")
            if now == want { return true }
            if now != last { last = now; unchangedSince = Date() }
            else if Date().timeIntervalSince(unchangedSince) > 0.6 { return false }
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
            // A blank box is restored by deleting. Otherwise the text is PASTED: typing key by key
            // lost characters on long prompts (ChatGPT dropped keystrokes after ~140 characters),
            // while a paste is one input event the editor handles whole, at any length.
            let ok = want.isEmpty ? KeyPoster.deleteSelection(to: pid) : KeyPoster.paste(text.trimmingCharacters(in: .newlines), to: pid)
            guard ok else { return false }
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

    /// A left click at a screen point, marked as MIRAGE's own (the gate lets it through).
    public static func click(at p: CGPoint) {
        for type in [CGEventType.leftMouseDown, .leftMouseUp] {
            guard let e = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: .left) else { continue }
            e.setIntegerValueField(.eventSourceUserData, value: marker)
            e.post(tap: .cghidEventTap)
        }
    }

    /// Pastes `text` with Command-V, then puts the user's own clipboard back. Only the text MIRAGE
    /// is inserting (the protected prompt) is ever on the clipboard, for about half a second.
    public static func paste(_ text: String, to pid: pid_t) -> Bool {
        let board = NSPasteboard.general
        let saved: [NSPasteboardItem] = (board.pasteboardItems ?? []).map { item in
            let copy = NSPasteboardItem()
            for type in item.types { if let data = item.data(forType: type) { copy.setData(data, forType: type) } }
            return copy
        }
        board.clearContents()
        guard board.setString(text, forType: .string),
              let down = CGEvent(keyboardEventSource: nil, virtualKey: 9, keyDown: true),
              let up = CGEvent(keyboardEventSource: nil, virtualKey: 9, keyDown: false) else { return false }
        let changeAfterSet = board.changeCount
        down.flags = .maskCommand
        up.flags = .maskCommand
        post([down, up], to: pid)
        // Give the app time to read the clipboard, then restore the user's (unless something
        // else has replaced it in the meantime).
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.6) {
            guard board.changeCount == changeAfterSet else { return }
            board.clearContents()
            if !saved.isEmpty { board.writeObjects(saved) }
        }
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
