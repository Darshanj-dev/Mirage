# MIRAGE progress

## Current milestone
M3 On the page (waiting for ChatGPT selectors from Inspect)

## Done
- M0 Setup: WXT 0.21 React project in the repo root, TypeScript strict, Vitest 5 with WXT plugin,
  host permissions for chatgpt.com and gemini.google.com only, docs/ and CLAUDE.md in repo.
  Gate passed: `npm run dev` opens Chrome with MIRAGE loaded.
- M1 Detector: Verhoeff, Luhn; mask rules AADHAAR, PAN, PHONE, EMAIL, UPI, IFSC; block rules CARD,
  API_KEY, PASSWORD, OTP; detect(text, settings) with overlap handling, safe words and Always mask
  terms; tokenizer (`«TYPE_n»`, same normalized value -> same token); 50-prompt test set.
  Gate passed: 243 tests, every rule has 5+ matches and 5+ look-alikes, all 50 prompts exact.

- M2 Vault and service worker: lib/vault.ts (AES-GCM 256, non-extractable key in IndexedDB,
  fresh IV per write, storage key as AAD, per-key write lock), lib/messages.ts (typed requests,
  validation, never-throwing sendMessage), lib/settings.ts (settings/stats/meta with defaults),
  lib/handlers.ts, entrypoints/background.ts (sender check, hourly sweep via chrome.alarms),
  lib/nameCheck.ts stub. Gate passed: 276 tests, incl. tokenize->restore, wrong-key record
  fails to decrypt, old records swept, nothing stored as plain text.

## In progress
- M3 On the page: code done, waiting for the manual gate on real ChatGPT.
  lib/sites.ts (ChatGPT: #prompt-textarea ProseMirror, #composer-submit-button), React UI in a
  Shadow DOM (ShieldBadge, Tooltip, MirageApp, usePromptWatcher), scan 300 ms after the box
  changes (MutationObserver), underlines via the CSS Custom Highlight API (no editor DOM changes),
  hover tooltips, PREVIEW message for exact placeholders, all strings in public/_locales/en.

## Next step
- Check the M3 gate: "My PAN is ABCDE1234F" -> blue badge with 1, hover shows «PAN_1».
- Then M4: intercept Enter/send, block panel, preview panel, masked send, restore replies.

## Decisions and gotchas
- Project lives in the repo root (not a mirage/ subfolder), next to the original .docx specs.
- The .docx specs are not committed; docs/*.md are the repo copies.
- docs/schema.md "Message types" and "Optional AWS name-check API" sections were not in the
  original Schema doc; they were derived from App Flow message contracts + Implementation Plan.
- Vitest 5 (not 3): Vitest 3 bundles Vite 7 and clashed with WXT's Vite 8 in `tsc`.
- Extra detector files beyond the Tech Stack list: types.ts (shared types), normalize.ts
  (Matching rule), ruleTestUtils.ts (5+/5+ table helper). Rule tests are rules.<type>.test.ts.
- Overlaps: secrets beat personal data, then longer beats shorter, then RULES order.
  OTP is ordered before PASSWORD so "one-time password: 7351" is named a one-time code.
- PAN and IFSC match upper case only (how they are written); lowercase is a known miss.
- Aadhaar never starts with 0/1 and must not touch a hyphen-joined token (UUID tails can pass Verhoeff).
- OTP: digits within 30 chars of "OTP"/"one-time …", or right after "code"/"verification code" etc.;
  bare "code" + digits elsewhere is ignored (developer prompts), and zip/PIN/error/status codes are skipped.
- UPI skips npm/git-style handles (wxt@latest, origin@main).
- Placeholder labels: NAME and CUSTOM (Always mask) both become «PERSON_n», so tokenizer counters are
  keyed by label rather than by EntityType (small deviation from schema.md VaultRecord.counters).
- Vault handlers live in lib/handlers.ts but are imported only by entrypoints/background.ts.
- The 24-hour sweep counts a send (TOKENIZE) as use; restoring a reply does not extend it.
- An unreadable vault record (e.g. key lost) is replaced on the next send; old replies then show
  placeholders. Nothing is ever sent raw because of it.
- Added message RENAME_CHAT (temp id -> real chat id), documented in docs/schema.md.
- fake-indexeddb added as a dev dependency (pre-approved in the Implementation Plan).
- Added message PREVIEW (like TOKENIZE, saves nothing) so hover shows the real next placeholder.
- The badge sits just above the composer's top-right corner so it never covers ChatGPT's buttons.
- Plural strings use a `_one` key (badge_found_one etc.) so text says "1 item", not "1 items".
- Page-changed state: the prompt box missing for 8 s shows a grey ! badge + error_pageChanged.
- Names are not found by rules (by design): test prompts list them under "names" as a known limit.
- Popup text is a hard-coded placeholder until M5 moves every string to _locales/en/messages.json.
