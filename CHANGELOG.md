# Changelog

What changed, per part of MIRAGE. Newest first. Downloads: [README → Download](README.md#download).

## Desktop companion — macOS (`desktop/`)

**2026-09-29**
- Fixed: the review window opened EMPTY and only showed its contents after a later change (the "slow popup"). It now shows everything at once, 0.14 s after the last key (measured from the real keystroke, 3 runs in ChatGPT), and Protect & Send works on the first click (starts ~0.08 s after it).
- The review opens **0.14 s after you stop typing** when the prompt has something sensitive (measured with real typing in ChatGPT 26.924; it was 0.75 s). It doesn't take the keyboard, follows the prompt as you type, and closes when the sensitive part is deleted.
- The first click on the popup works (a popup that isn't focused ignored its first click).
- "MIRAGE active" badge on the ChatGPT / Claude message box, with an on/off switch in the menu bar and Settings. It turns amber or red when something will be hidden; click it to reopen the review.
- Every Return checks the box you are typing in, whatever its label (a mismatch once let a message through as "clean").
- The popup appears at once on Enter (hold first, check in the background), fully on screen, right above the message box. No underlines.
- `~/Library/Logs/MIRAGE/gate.log`: reason codes and timings only, never text.

## Desktop companion — Windows (`desktop-windows` branch, beta)

**2026-09-29**
- One-click install: **Install-MIRAGE-Desktop.bat** downloads the installer from the GitHub release, checks its SHA-256 fingerprint and runs it.
- The review opens **0.12–0.24 s after you stop typing** (polls the prompt box of ChatGPT / Claude only), without taking the keyboard, right above the message box.
- The detector warms up at launch; every Return checks the prompt box; MIRAGE's own window never has its clicks held; Enter works in MIRAGE's own window.
- Built, core-tested (9 tests) and self-tested (core, hooks, UI Automation, settings) on Windows by GitHub Actions. Not yet tried with the ChatGPT or Claude apps on Windows.

## Browser extension (`lib/`, `components/`, `entrypoints/`) — v1.0.0

**2026-09-29**
- Private Compose side panel: write the prompt in MIRAGE, insert only the protected version.
- Address and passport detection; hover-only restore by default.
- Platform adapters, detection v2 with a 0–100 risk score, reply check, new UI.
- Windows installer for Chrome / Edge; zips for Chrome, Edge and Firefox.

**2026-09-28**
- M0–M5: detector rules with checksums, encrypted vault, live highlights, send interception with masked send, reply restore, ChatGPT and Gemini support, popup and welcome page.
