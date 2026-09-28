# MIRAGE progress

## Current milestone
M5 Complete v1

## Done
- M4 Protect and restore (MVP, tag v0.1, 2026-09-28): verified on real ChatGPT — preview panel,
  masked send (ChatGPT saw only «PAN_1»/«PHONE_1», checked with MIRAGE off), reply restored with
  dotted underline, Email-card placeholders show the value on hover, API key blocked and
  "Remove secret and send" sent «SECRET_REMOVED».
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
- M3 On the page: badge, live highlights (CSS Custom Highlight API), hover placeholders.
  Gate passed on real ChatGPT 2026-09-28: PAN -> blue badge 1 + «PAN_1»; password -> red badge.

## In progress
- Nothing.

## Next step
- Confirm F5 on a protected chat keeps restored values (fixed in 71c1aea, not yet seen after reload).
- M5 session 1: Gemini selectors (take them from gemini.google.com via DevTools, like ChatGPT),
  then the popup (S7): on/off, status, weekly counts, Quick mode, Safe words, Always mask, Clear.

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
- Short secrets (<16 chars) are shown as 8 dots; long keys as first 3 + last 4 (sk-•••••7f2a).
- Preview pill hover names the kind of detail, not the value (Content rule 7 beats App Flow).
- The token-keeping note is appended to every protected prompt and is visible in the preview
  (resolves PRD open question 3): "(Keep the «» placeholders exactly as written.)"
- Restored values are written into the page's text nodes (no new elements), so a site re-render
  just re-triggers the restore. Real values then exist in the page DOM (on screen only).
- ChatGPT new chats: URL is "/" while typing, then briefly /c/WEB:<client id>, then /c/<uuid>.
  Only a full UUID counts as a chat id; values are saved under new-<uuid> and renamed (merged if
  needed) once the real id appears. Unrenamed new-* records are swept after 1 hour.
- Editable reply cards (ChatGPT "Email" writing blocks, ProseMirror): never rewritten; the value
  shows on hover ("ChatGPT saw «PAN_1». Your detail: …").
- Names are not found by rules (by design): test prompts list them under "names" as a known limit.
- Popup text is a hard-coded placeholder until M5 moves every string to _locales/en/messages.json.
