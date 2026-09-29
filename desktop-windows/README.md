# MIRAGE desktop companion — Windows (beta)

Port of the macOS companion (`../desktop`) to Windows 10/11. Protects prompts in the **ChatGPT** and **Claude** desktop apps before they are sent, on this PC.

| macOS | Windows |
|---|---|
| Swift, SwiftUI menu bar | C# .NET 8, WinForms notification-area app |
| MIRAGE Core in JavaScriptCore | the **same** `mirage-core.js` in [Jint](https://github.com/sebastienros/jint) |
| Accessibility API | UI Automation |
| Event tap, synchronous check | Low-level keyboard/mouse hooks: **hold, check in the background, re-send if clean** (Windows skips slow hooks, so the hook never does the check itself) |
| Accessibility permission | none required |

## Status — read this first

**Beta, not yet tested on Windows.** It is built and its core tests run on GitHub's Windows machines, but nobody has run it against ChatGPT or Claude on Windows yet. The adapters follow the app structure verified on macOS (the same web front ends). At run time MIRAGE checks every step (it reads back what it typed) and never claims a send it didn't see; if something doesn't match, it stops and says so.

Not in the Windows beta yet: the reply check, the settings window (use the tray menu), notarised-style code signing (SmartScreen may warn).

## Build
```
npm ci && npm run build:core            # repo root: bundles the shared core
dotnet test desktop-windows/tests/Mirage.Core.Tests
dotnet publish desktop-windows/src/Mirage.Desktop -c Release -r win-x64 --self-contained -p:PublishSingleFile=true
```
The installer (`installers/windows/mirage-desktop.iss`) is built by `.github/workflows/windows-desktop.yml`.
