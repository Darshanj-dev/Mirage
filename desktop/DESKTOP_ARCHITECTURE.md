# MIRAGE Desktop — Architecture

A native macOS menu-bar app that protects prompts in **supported** AI desktop apps before they are sent. One process, no server, no network.

```
 MIRAGE CORE (TypeScript, ../lib)          one source of truth for the extension and the desktop app
   detector · risk · masking · policy       bundled by `npm run build:core` → mirage-core.js
          │ runs inside JavaScriptCore (built into macOS)
 ┌────────┴───────────────────────────────────────────────────────────┐
 │ MIRAGE.app (Swift, one process)                                     │
 │  MirageCore   MirageCoreEngine: loads mirage-core.js, typed models   │
 │  MirageAgent  AppMonitor → which app is in front (NSWorkspace events)│
 │               SubmitGate → event tap, ON only while a protected app  │
 │                            is in front; Return + clicks only         │
 │               Adapters   → ChatGPT, Claude (one file each)           │
 │               AX         → Accessibility calls, 0.5 s cap each       │
 │               ProtectionController → the workflow below              │
 │               Stores     → settings + counts (JSON, 0600)            │
 │  MirageApp    SwiftUI: menu bar, decision panel, onboarding,         │
 │               dashboard, settings (general/apps/detection/policy/    │
 │               permissions/privacy/security)                          │
 └──────────────────────────────────────────────────────────────────────┘
```

## Protection workflow

```
User presses Return (or clicks Send) in ChatGPT / Claude
  → SubmitGate (event tap) asks ProtectionController, synchronously (~5–11 ms measured):
      focused element is the adapter's prompt box?  no → pass through
      read it (Accessibility) → MirageCore.analyze (0.7 ms)
      nothing to hide? → pass through (the user's own event goes on, untouched)
      else → HOLD (the event is dropped: the app never sees it) → decision panel (15–57 ms)
  Decision panel: "Your information has NOT been sent yet."  ← shown only in this held path
    Protect & Send → background queue:
        re-read (edited meanwhile? re-check) → MirageCore.protect
        → give focus back to the app → select all + type the protected text as keyboard input
        → read back until the box settles; must equal the protected text   (mandatory)
             mismatch → put the original back → "Protection could not be verified. Your original
                        message has not been submitted."
        → press Return (marked as MIRAGE's own so the gate lets it through)
        → wait for the app to clear the box → only then "Sent protected"
             not cleared → "ChatGPT didn't send. Your protected message is in the box."
    Cancel → close; the prompt is untouched (MIRAGE never wrote to it)
    Send anyway → critical items need "I Understand — Send"
  After any send: reply check (snapshot before, read after it settles, report only new findings)
```

## Why these choices

| Choice | Why |
|---|---|
| JavaScriptCore, not a port | One detector for extension and desktop. No duplicated rules to drift apart. No Node runtime. |
| One process, no IPC | UI, agent and core live together: nothing to spoof, no socket, no local HTTP server. |
| Event tap, gated | The only supported way to hold a key press or click before another app gets it. Enabled only while a protected app is in front; inspects key code + mouse position only. |
| Type, don't set, the protected text | Electron editors (ChatGPT, Claude) keep their own copy of the text. Setting the Accessibility value changes what is displayed, not what Send uses; typing goes through the editor's input path. Seen live. |
| Send-button rectangle cache | "What is under the mouse?" is too slow in Electron at click time (clicks passed unchecked, seen live). The rectangle is refreshed as the prompt changes, off the main thread. |
| Background queue for Accessibility | Typing in the AI app never waits on MIRAGE. The gate path does ~5 quick calls; everything else is async. |
| No App Sandbox | The Accessibility API cannot control other apps from inside the sandbox. Hardened Runtime is on; no extra entitlements. |
| Pinned code-signing requirement | Without it, macOS ties the Accessibility grant to one build's hash and drops it on every rebuild (seen live). |

## Recovery

- **Wake:** tap reinstalled, caches cleared, permission re-read.
- **Permission revoked:** tap removed immediately, apps shown as "Needs permission". **Restored:** re-armed within ~2 s, no restart.
- **App relaunch:** new pid → prepared again (Electron Accessibility switch), caches rebuilt.
- **Core fails to load:** "Detection unavailable" in the menu. The gate is not armed.
- **Damaged settings:** replaced by defaults, damaged copy kept aside, the user is told.
- **A hung app:** every Accessibility call is capped at 0.5 s. If the prompt can't be read after Return in the prompt box, the send is held: "MIRAGE couldn't check this message".
