# MIRAGE progress

## Current milestone
M1 Detector

## Done
- M0 Setup: WXT 0.21 React project in the repo root, TypeScript strict, Vitest with WXT plugin,
  host permissions for chatgpt.com and gemini.google.com only, docs/ and CLAUDE.md in repo,
  empty lib/ and components/ stubs.

## In progress
- Nothing.

## Next step
- M1 session 1: verhoeff.ts, luhn.ts, rules for AADHAAR, PAN, PHONE, EMAIL, UPI, and detect().

## Decisions and gotchas
- Project lives in the repo root (not a mirage/ subfolder), next to the original .docx specs.
- The .docx specs are not committed; docs/*.md are the repo copies.
- docs/schema.md "Message types" and "Optional AWS name-check API" sections were not in the
  original Schema doc; they were derived from App Flow message contracts + Implementation Plan.
- Vitest config uses `WxtVitest()` from `wxt/testing/vitest-plugin` (fake browser APIs available).
- Popup text is a hard-coded placeholder until M5 moves every string to _locales/en/messages.json.
