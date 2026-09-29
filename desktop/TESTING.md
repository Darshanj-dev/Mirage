# MIRAGE Desktop — Testing

## Automated
| Suite | Count | Covers |
|---|---|---|
| `swift test` MirageCoreTests | 10 | Shared core in JavaScriptCore: demo prompt critical with explained score, redaction never reveals values, protect/placeholders/secrets removed, protected prompt checks clean, session placeholders, keep, categories/policy, reply check, latency < 50 ms (measured 0.66 ms) |
| `swift test` MirageAgentTests | 11 | Settings defaults/round-trip/0600, damaged settings recovery, daily stats, stats hold no text, text normalization, adapter registry (incl. `com.openai.codex`), adapter status matches live results, exact send labels, **no log line interpolates text** |
| `npm test` (extension, shared core) | 744 | Unchanged extension behaviour with the core API added |

## Live end-to-end (2026-09-29, this Mac)
Driver: `MIRAGE --e2e`, fictional values (`AKIAQ7Z3MIRAGEDEMO42`, `BNZPM2501K`, `priya.demo@example.com`), real key/mouse events.

| App | Scenario | Result | Gate check | Hold → panel |
|---|---|---|---|---|
| ChatGPT 26.924 | Return → Cancel | ✅ held, "NOT been sent yet" shown, prompt untouched | 5.7 ms | 34 ms |
| ChatGPT 26.924 | **Click Send** → Cancel | ✅ held, prompt untouched | 5.7 ms | 22 ms |
| ChatGPT 26.924 | Return → **Protect & Send** | ✅ protected text in box at 1.0 s (no raw), sent at 1.5 s, newest message holds only placeholders | 11 ms | 56 ms |
| Claude 2.9939.2 | Return → Cancel | ✅ held, prompt untouched | 8.0 ms | 57 ms |
| Claude 2.9939.2 | Click Send → Cancel | ✅ held, prompt untouched | 5.7 ms | 15 ms |
| Claude 2.9939.2 | write → verify → restore | ✅ verified, original intact 2 s later | — | — |
| Claude | Protect & Send final send | **not run** (would post into the development conversation) | | |
| ChatGPT | Reply check | **not verified** (the app changed view during the run) | | |

## Bugs found by live testing (all fixed)
1. Welcome window never appeared (menu-bar app, icon hidden by the notch; window on another Space).
2. Accessibility grant lost on every rebuild (signature fell back to cdhash) → pinned requirement.
3. Electron apps only list windows under `AXWindows`; initial tree needs time after `AXManualAccessibility`.
4. **Async write race:** a late write overwrote the restored original → verify only after the box settles.
5. **Send-button clicks passed unchecked** (hit-testing too slow) → cached button rectangle.
6. Panel created at 0×0 → self-sizing hosting controller.
7. Protected text typed while MIRAGE's panel had focus went nowhere → focus returned to the app first.
8. "Sent protected" claimed before the app sent → claimed only once the box clears.
9. Blank prompt restored as blank lines → deleted instead.

## Performance (measured)
Idle: **0.0% CPU**, **20 MB** physical footprint (78 MB RSS incl. shared frameworks), 3 threads. Detection 0.66 ms. Gate check 5–11 ms. Hold → panel 15–57 ms. Protect & Send: text replaced and verified ≈1 s, sent ≈1.5 s.

## Manual checklist (to run by hand)
Normal prompt passes · PAN · Aadhaar · phone · email · password · API key · AWS keys · database URL · multiple secrets · false positives (code, hashes) · long prompt · code block · pasted content · edit while panel open (re-checked) · Cancel · Protect · Send anyway (critical asks twice) · quit/relaunch AI app · sleep/wake · revoke and restore Accessibility.

## What MIRAGE detects / doesn't
See `../docs/detection.md` (shared core): spacing/case/Unicode look-alikes, JSON/YAML/.env/URLs, connection strings — detected. Base64-encoded or split secrets, images, files, voice — not detected.
