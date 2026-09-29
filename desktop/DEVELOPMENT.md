# MIRAGE Desktop — Development

## Requirements
macOS 14+, Xcode 16+ (tested with Xcode 27 / Swift 6.4), Node 20+ for the shared core, an Apple Development or Developer ID signing identity (ad-hoc works but loses the Accessibility grant on every rebuild).

## Build and run
```
npm install                       # repo root
desktop/scripts/build-app.sh      # builds the core bundle, the app, signs it → desktop/build/MIRAGE.app
open desktop/build/MIRAGE.app
```
The script assembles and signs outside `~/Desktop` (codesign rejects attributes macOS adds there), then copies the signed app into `desktop/build/`. The designated requirement is pinned to the signing certificate so macOS keeps the Accessibility permission across rebuilds.

## Tests
```
cd desktop && swift test          # core bridge + agent (21 tests)
cd .. && npm test && npm run eval # extension + shared detector
```

## Developer tools (all in the MIRAGE binary)
| Command | What it does |
|---|---|
| `--inspect <bundle-id>` | Writes an app's Accessibility structure (control labels ≤ 30 chars, value lengths only) to `~/Library/Logs/MIRAGE/ax-*.txt` |
| `--selftest-adapter <bundle-id>` | Finds the prompt box, writes a unique test line, verifies, restores the original, checks 2 s later that nothing landed late. Never sends. |
| `--read-adapter <bundle-id>` | Read-only: length of the prompt box and whether it holds a self-test line |
| `--e2e <bundle-id> <cancel\|click-cancel\|protect\|reply>` | End-to-end against the running MIRAGE (which must be started with `--debug-hooks`): types a fictional demo prompt, sends as a user would, checks the hold and the outcome |
| `--debug-hooks` | Development only: lets the E2E driver ask for status and press Protect/Cancel via distributed notifications |
| `--snapshots <dir>` | Renders the UI to PNG (AppKit controls show as placeholders in renders) |

Run them with `open -n desktop/build/MIRAGE.app --args …` so they use MIRAGE's Accessibility permission.

## Not done yet
Notarization and a Developer ID build; an installer/DMG; auto-update; Claude's final-send verification; Gemini/Copilot/Perplexity adapters.
