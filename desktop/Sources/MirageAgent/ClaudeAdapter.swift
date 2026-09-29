// Claude for macOS (com.anthropic.claudefordesktop), Electron. Its web content only appears in
// the Accessibility tree after the app is told an assistive client is present
// (AXManualAccessibility, the switch Electron documents for this).
//
// Mapped with `MIRAGE --inspect com.anthropic.claudefordesktop` on Claude 2.9939.2 (2026-09-29):
//   prompt box   AXTextArea, description "Prompt", value readable and settable
//   send control AXButton next to it; reads "Stop" while a reply runs (never treated as send)
//   pitfall      the sidebar has "Send feedback": only exact send labels count
// Status stays `.checkingOnly` until the full protect flow has been tested by hand.

import ApplicationServices
import Foundation

public final class ClaudeAdapter: TextAreaAdapter {
    override public var id: AppID { .claude }
    override public var displayName: String { "Claude" }
    override public var bundleIdentifiers: [String] { ["com.anthropic.claudefordesktop"] }
    override public var status: AdapterStatus { .checkingOnly }

    override public var prefersSelectionReplace: Bool { true }
    // Electron: type the protected text (updates the editor's own copy) and send with Return.
    override public var typesText: Bool { true }
    override public var submitsWithReturn: Bool { true }

    override public func prepare(app: AXElement) {
        AX.set(app, "AXManualAccessibility", kCFBooleanTrue)
    }

    private static func label(_ el: AXElement) -> String {
        [AX.descriptionText(el), AX.title(el), AX.placeholder(el), AX.help(el)].compactMap { $0 }.joined(separator: " ").lowercased()
    }

    /// The composer: a settable text area labelled as the prompt ("Prompt" in the app, "Write
    /// your prompt to Claude" / "Reply to Claude" on the web layout it embeds).
    override public func isInput(_ element: AXElement) -> Bool {
        guard AX.role(element) == kAXTextAreaRole, AX.isSettable(element, kAXValueAttribute) else { return false }
        let l = Self.label(element)
        return l.contains("prompt") || l.contains("reply to claude") || l.contains("message claude")
    }

    /// Exact labels only: "Send", "Send message", "Submit". Never "Send feedback", never "Stop".
    override public func isSendControl(_ element: AXElement) -> Bool {
        guard AX.role(element) == kAXButtonRole else { return false }
        let l = Self.label(element).trimmingCharacters(in: .whitespaces)
        return ["send", "send message", "submit", "send prompt"].contains(l)
    }
}
