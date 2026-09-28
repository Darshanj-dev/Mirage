# MIRAGE — Implementation Plan

Sep 28, 2026 · Ninad Pandith M N

## Overview

Build MIRAGE in eight milestones; the MVP is complete at M4. Every milestone ends with a gate you can see working. Work top to bottom; don't start a milestone until the previous gate passes. After every session, update PROGRESS.md.

When documents disagree, the newest wins: Schema over Tech Stack over PRD for data; Content Guidelines for any user-facing words.

## Roadmap

| Milestone | Scope | Gate | Est. |
|---|---|---|---|
| M0 Setup | Repo, WXT, docs | Dev build runs | ~1 session |
| M1 Detector | Rules, checksums | Rule tests pass | ~2 sessions |
| M2 Vault | Encryption, messages | Vault tests pass | ~2 sessions |
| M3 On the page | Highlights, badge | PAN highlighted | ~2 sessions |
| **M4 Protect (MVP)** | Intercept, preview | Full demo works | ~3–4 sessions |
| M5 Complete v1 | Gemini, popup, copy | Both sites work | ~3 sessions |
| M6 Showcase | Tests, README, video | Repo public | ~2 sessions |
| M7 AWS (optional) | Name-check Lambda | Switch works | ~2 sessions |

If time runs short, stop after M4 and jump to the README and demo video part of M6.

## Session routine

- Start: "Read CLAUDE.md and PROGRESS.md, then tell me the next step."
- Work in small tasks; run npm test after each.
- Check the gate or the partial result yourself in Chrome.
- End: update PROGRESS.md, then commit and push. Commit messages say what works now ("M1: PAN and Aadhaar rules with tests").

## M0 Setup

Set up the project structure from tech-stack.md: empty folders and files in lib/ and components/, Vitest with one passing sample test, host permissions for chatgpt.com and gemini.google.com only, npm scripts test and build. No feature code.

**Gate:** npm run dev opens Chrome with MIRAGE loaded (the default popup shows), and npm test passes.

## M1 Detector

Session 1: lib/detector/ — verhoeff.ts, luhn.ts, rules for AADHAAR, PAN, PHONE, EMAIL, UPI, and detect(text, settings) returning Finding[]. Each rule gets a .test.ts with at least 5 matching and 5 non-matching cases, including look-alikes (12-digit order numbers that fail Verhoeff).

Session 2: secret rules (CARD with Luhn, API_KEY, PASSWORD, OTP) with policy 'block', and IFSC with policy 'mask'. lib/tokenizer.ts: numbered placeholders «TYPE_n», same normalized value gets the same token (schema.md, Matching rule). test-prompts/prompts.json with 50 prompts (prd.md, Testing and demo), fictional data only. Tests for all.

**Gate:** npm test passes for every P0 rule, and the detector finds the expected items in all 50 test prompts.

## M2 Vault and service worker

lib/vault.ts (AES-GCM, non-extractable key in IndexedDB, fresh IV per write, storage key as additional data), lib/messages.ts (all Request and Response types), lib/settings.ts with defaults, and entrypoints/background.ts handling TOKENIZE, RESTORE, GET_SETTINGS, SET_SETTINGS, CLEAR_VAULT, GET_STATS and COUNT. Hourly 24-hour sweep with chrome.alarms. Unit-test vault encrypt/decrypt, tokenize-then-restore, and the sweep. Never log values.

**Gate:** tests show a value tokenized then restored correctly, a record under the wrong key fails to decrypt, and old records are swept.

## M3 On the page

Find the ChatGPT selectors by hand with Inspect (prompt box, send button); guessing selectors is where AI tools fail most. Put them in lib/sites.ts. In entrypoints/content, mount a React UI inside a Shadow DOM with WXT's content-script UI helper. Run detect() 300 ms after typing stops, show the shield badge (S1) with its states, and show hover text for each finding. Start with the badge and count; highlights next. All text from the strings file.

**Gate:** typing "My PAN is ABCDE1234F" on ChatGPT turns the badge blue with a count of 1, and hovering shows «PAN_1».

If underlining words inside ChatGPT's prompt box proves unreliable, fall back to showing the found items as a list in a small panel above the box; the gate still counts.

## M4 Protect and restore

Intercept, preview, block: intercept Enter and the send button in the capture phase. Nothing found: let it send. Secret: Block panel (S4) with Remove secret and send, and Edit prompt. Personal data: TOKENIZE via the service worker, show the Preview panel (S3), and on Send protected write the masked text into the prompt box, dispatch an input event, then send. On any error, block and show error text. Never fail open.

Restore: watch ChatGPT replies with a MutationObserver. As text streams in, find «TYPE_n» placeholders, call RESTORE, and replace them in text nodes only, with a dotted underline and the restore.hover tooltip. Leave unknown placeholders with the amber style (restore.failed). Report failures with the COUNT message.

**Gate:** the full demo from the PRD works on ChatGPT three times in a row: the Priya prompt is hidden, the reply shows her real name and phone, and a fake API key is blocked. This is the MVP: commit, tag v0.1, record a quick screen video.

## M5 Complete v1

1. Gemini support (selectors in lib/sites.ts only, reusing all logic). Popup (S7): on/off, status line, weekly counts, Quick mode, Safe words, Always mask (encrypted), Clear saved details with confirm.
2. Quick mode chip and the offer after the 5th protected send; "Not personal" on highlight hover; right-click "Always mask this"; "Copy with details" button beside replies; protected-message receipt (S6). All strings from _locales/en/messages.json.
3. Welcome page (S8): fake chat box with the sample prompt, "See what the AI receives", "See the reply", final card. Sends nothing. Opens once on install.

**Gate:** the full demo works on both ChatGPT and Gemini, and every setting in the popup survives a browser restart.

## M6 Showcase

- [ ] Run the 50-prompt test set; record hidden rate, blocked rate, false positives and restore rate.
- [ ] Write the README from the Content Guidelines outline, with the real numbers and the Limits section.
- [ ] Record the 2-minute demo video and a 10-second GIF.
- [ ] Make the GitHub repo public; add topics (chrome-extension, privacy, ai-safety).
- [ ] Run npm run zip for a store-ready package.

**Gate:** a stranger can understand MIRAGE from the repo page in 2 minutes.

## M7 AWS name check (optional)

Only if AWS credits are available. In aws/, a Python Lambda that calls Comprehend DetectPiiEntities, keeps NAME only, and returns positions without logging text. SAM template for the HTTP API in ap-south-1. Fill in nameCheck(text) in the service worker, behind the awsNameCheck setting, with a 3-second timeout that falls back to local rules. Set a billing alarm before deploying anything.

**Gate:** with the setting on, a name not in Always mask is hidden; with Wi-Fi off, sending still works using local rules.

## Hackathon mode

Check with the organisers whether code written before the event is allowed. If yes: arrive with M4 done and spend the event on M5–M7. If no: follow the 30-hour schedule (0–6 M0–M1; 6–22 M2–M4, hour 22 is the hard checkpoint; 22–28 M5 + test set; 28–30 demo prep).

## When things go wrong

| Problem | Fallback |
|---|---|
| Vault tests fail because IndexedDB doesn't exist in Vitest | Dev-only package fake-indexeddb, for tests only (approved) |
| Masked text doesn't reach ChatGPT (it sends the original) | Use the exact prompt-box HTML from Inspect and set text the way the page expects |
| Underlines inside the prompt box glitch while typing | Use the list-panel fallback from M3 |
| Replies restore only after streaming ends | Acceptable for the MVP |
| ChatGPT changed its page | Update lib/sites.ts only |
| Stuck more than 45 minutes on one bug | Note it in PROGRESS.md, move on, come back later |
| Running out of time | Stop at M4, then only README and video from M6 |

Review every change to lib/vault.ts, lib/messages.ts and the send interception before committing. The one thing never to cut: fail-closed behaviour.
