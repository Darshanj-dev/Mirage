# MIRAGE progress

## Current milestone
M2 Vault and service worker

## Done
- M0 Setup: WXT 0.21 React project in the repo root, TypeScript strict, Vitest 5 with WXT plugin,
  host permissions for chatgpt.com and gemini.google.com only, docs/ and CLAUDE.md in repo.
  Gate passed: `npm run dev` opens Chrome with MIRAGE loaded.
- M1 Detector: Verhoeff, Luhn; mask rules AADHAAR, PAN, PHONE, EMAIL, UPI, IFSC; block rules CARD,
  API_KEY, PASSWORD, OTP; detect(text, settings) with overlap handling, safe words and Always mask
  terms; tokenizer (`«TYPE_n»`, same normalized value -> same token); 50-prompt test set.
  Gate passed: 243 tests, every rule has 5+ matches and 5+ look-alikes, all 50 prompts exact.

## In progress
- Nothing.

## Next step
- M2: lib/vault.ts (AES-GCM, key in IndexedDB), lib/messages.ts, lib/settings.ts,
  entrypoints/background.ts handlers, hourly 24-hour sweep. fake-indexeddb is pre-approved for tests.

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
- Names are not found by rules (by design): test prompts list them under "names" as a known limit.
- Popup text is a hard-coded placeholder until M5 moves every string to _locales/en/messages.json.
