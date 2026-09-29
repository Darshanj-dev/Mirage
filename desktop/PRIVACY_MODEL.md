# MIRAGE Desktop — Privacy model

**Your prompts are processed on this Mac.** MIRAGE has no server, makes no network requests, and needs no account.

| | |
|---|---|
| Local processing | Active: detection runs in JavaScriptCore inside MIRAGE (≈0.7 ms per prompt) |
| Cloud processing | Not required, not used |
| Data collection | None. No analytics, no telemetry |

**What MIRAGE reads:** the text in the prompt box of supported AI apps, when you press Return or Send there (and, debounced, while you type, to colour the menu-bar shield); after a send, the conversation text of that app, for the reply check.

**What MIRAGE stores** (`~/Library/Application Support/MIRAGE`, owner-only):
- `settings.json` — switches and policy
- `stats.json` — counts per day (checked, held, masked, removed, cancelled…) and category counts

**What MIRAGE never stores:** prompts, replies, passwords, API keys, private keys, IDs or any raw sensitive value. The placeholder map lives in memory for the session and is gone when MIRAGE quits.

**What MIRAGE never does:** record the screen, record the keyboard, use the microphone, watch unrelated apps, collect browsing history, upload anything.

**Logs:** OSLog lines name the kind of item and counts ("held a send: 4 items, level critical"), never the item.
