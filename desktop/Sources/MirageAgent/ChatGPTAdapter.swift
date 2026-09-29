// ChatGPT for macOS. The build on the development Mac (26.924.51851, 2026-09-29) identifies as
// com.openai.codex and is Electron-based (its framework is a renamed Electron framework), so its
// web content only appears in the Accessibility tree after AXManualAccessibility.
//
// Mapped with `MIRAGE --inspect com.openai.codex`:
//   prompt box   AXTextArea, title/description "Do anything", value readable and settable
//   send control AXButton "Send" beside "Dictate" and "Add files and more" (never send)

import ApplicationServices

public final class ChatGPTAdapter: TextAreaAdapter {
    override public var id: AppID { .chatgpt }
    override public var displayName: String { "ChatGPT" }
    override public var bundleIdentifiers: [String] { ["com.openai.chat", "com.openai.codex"] }
    // Verified live on 26.924.51851 (2026-09-29): Return and Send-click held, Cancel leaves the
    // prompt untouched, Protect & Send types the protected prompt, sends it and ChatGPT's newest
    // message holds only placeholders (desktop/TESTING.md).
    override public var status: AdapterStatus { .verified(version: "26.924.51851", date: "2026-09-29") }

    override public var prefersSelectionReplace: Bool { true }
    // Electron: type the protected text (updates the editor's own copy) and send with Return.
    override public var typesText: Bool { true }
    override public var submitsWithReturn: Bool { true }

    override public func prepare(app: AXElement) {
        AX.set(app, "AXManualAccessibility", kCFBooleanTrue)
    }

    private static func label(_ el: AXElement) -> String {
        [AX.descriptionText(el), AX.title(el), AX.placeholder(el)].compactMap { $0 }.joined(separator: " ").lowercased()
    }

    override public func isInput(_ element: AXElement) -> Bool {
        guard AX.role(element) == kAXTextAreaRole, AX.isSettable(element, kAXValueAttribute) else { return false }
        let l = Self.label(element)
        return ["do anything", "ask anything", "message chatgpt", "ask chatgpt", "prompt"].contains { l.contains($0) }
    }

    override public func isSendControl(_ element: AXElement) -> Bool {
        guard AX.role(element) == kAXButtonRole else { return false }
        let l = Self.label(element).trimmingCharacters(in: .whitespaces)
        return ["send", "send message", "send prompt"].contains(l) || l == "send send"
    }
}
