# Supported applications

MIRAGE protects **supported AI desktop applications**. It is not "every AI app".

| App | Version tested | Status | Verified live (2026-09-29) |
|---|---|---|---|
| **ChatGPT** (`com.openai.codex`, also `com.openai.chat`) | 26.924.51851 | ✓ **Protected** | Return held · Send-click held · Cancel leaves prompt untouched · Protect & Send: protected text typed and verified, sent, and ChatGPT's newest message holds only placeholders |
| **Claude** (`com.anthropic.claudefordesktop`) | 2.9939.2 | **Beta** | Return held · Send-click held · Cancel leaves prompt untouched · write/verify/restore on the prompt box. **Not run:** the final send of Protect & Send (the only Claude window was the development conversation). |
| Gemini, Microsoft Copilot, Perplexity | — | Unsupported AI application | Not implemented. Shown as unsupported; never described as protected. |

## How an app's structure was mapped

`MIRAGE --inspect <bundle-id>` writes the app's Accessibility structure (roles, control labels cut to 30 characters, value **lengths** only) to `~/Library/Logs/MIRAGE/`.

**ChatGPT 26.924** (Electron; needs `AXManualAccessibility`)
- Prompt: `AXTextArea`, title/description "Do anything", settable
- Send: `AXButton` "Send" (next to "Dictate", "Add files and more", which never count)
- Empty prompt reads as the placeholder text

**Claude 2.9939.2** (Electron; needs `AXManualAccessibility`)
- Prompt: `AXTextArea`, description "Prompt", settable
- Send: `AXButton` "Send" when idle, "Stop" while a reply runs (never a send)
- Pitfall: sidebar "Send feedback" — only exact labels count

## When an app updates

Only its adapter changes (`Sources/MirageAgent/<App>Adapter.swift`). Re-run `--inspect`, `--selftest-adapter` and the E2E scenarios (TESTING.md), then update the version in the adapter's `status`.
