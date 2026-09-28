# MIRAGE — Product Requirements Document

Sep 28, 2026 · Ninad Pandith M N

## Overview

MIRAGE is a Chrome extension that masks personal data and blocks secrets in a prompt before it reaches ChatGPT or Gemini, then restores the real values in the AI's reply, on the user's device.

This PRD is the single source of truth for the build. It fixes what to build first, what counts as done, and what is deliberately left out, so a solo builder does not drift into extra features.

How to use it:

- Build every P0 requirement before touching any P1. P0 alone is a complete, demoable product.
- When a new idea comes up, add it to Future roadmap, not to the current milestone.
- Tick off tasks in the Build plan as you go, and update Open questions when you decide something.

Version 0.1. Builder: one person (team of four on paper). Deployment: local-first; AWS is optional and added last.

## Problem

People paste names, ID numbers, phone numbers, health results and passwords into AI chatbots, and nothing on their side checks the prompt before it is sent. Once sent, it sits on the provider's servers, in logs, and depending on settings may be reviewed or used for training.

Existing protections act too late or cover the wrong people:

| Existing protection | Why it falls short |
|---|---|
| Chatbot privacy settings | Applied on the provider's side, after the data has arrived |
| Deleting a chat | After sending; cannot undo the first exposure |
| Enterprise AI data-loss tools | Run by company IT; protect managed employees only |
| Plain PII redaction | Deletes the data, so the AI loses the context it needs to answer |

Evidence (from the pitch deck):

- Harmonic Security (Jan 2026): 579,000 of 22.4M workplace prompts to GenAI apps in 2025 held company-sensitive data (2.6%); 17% of exposures came through personal or free accounts.
- Bloomberg (May 2023): Samsung restricted staff use of generative AI after engineers pasted source code into ChatGPT.

The gap MIRAGE fills: a free, on-device check for individuals, with Indian IDs (Aadhaar, PAN, UPI, IFSC) supported from the start.

## Target users

The primary user is an everyday person in India using a free AI chatbot with no IT team behind them.

| Persona | Typical prompt | Data at risk | What they need |
|---|---|---|---|
| Priya, engineering student | "Write a leave mail to my HOD, my roll no. is…" | Name, email, phone, college ID | Protection without changing how she uses ChatGPT |
| Ramesh, diabetic patient | "My HbA1c is 7.9, what does it mean?" | Name, health result, phone | Health data not tied to his identity |
| Anita, small office manager | "Draft an invoice reminder to our client…" | Client names, PAN, GSTIN, bank details | A simple control, ahead of DPDP Rules |
| Arjun, student developer | "Why is this code failing?" (pastes code with an API key) | API keys, passwords, tokens | Secrets blocked before they leave |

Out of scope for v1: companies with managed IT, who already have enterprise tools.

## Goals, non-goals and success metrics

v1 succeeds when a user can type a real-looking prompt in ChatGPT, see it masked, get a useful answer, and see their real details restored, with secrets blocked.

Goals:

- Mask personal data in prompts on ChatGPT and Gemini before sending.
- Block secrets (API keys, passwords, OTPs, card numbers) outright.
- Restore real values in the AI's reply, on the device only.
- Detect Indian IDs accurately, with Aadhaar verified by its checksum.
- Work fully offline from any backend (local-only mode).

Non-goals for v1:

- File uploads, PDFs, images or voice prompts.
- Browsers other than Chrome (and Chromium-based ones like Edge).
- Mobile apps, or chatbots other than ChatGPT and Gemini.
- Company admin consoles, billing or user accounts.

| Metric | Target | How it is measured |
|---|---|---|
| Secrets blocked | 100% of test secrets | Test prompt set, 50+ prompts |
| Personal data masked | 95% or more of test items | Same test set, counted per item |
| Tokens restored in replies | 95% or more | 20 live chats, count tokens left unreplaced |
| False positives | Under 5% of items flagged | Normal prompts with no personal data |
| Added delay before send | Under 200 ms (local mode) | Timed in the extension |

All targets are for our own test set; they are goals, not measured results yet.

## User stories and core flow

Every prompt takes one path: secrets stop at the device, personal data leaves only as tokens, and real values come back only on screen.

- As a user, I type in ChatGPT or Gemini as usual, so I do not have to learn anything new.
- As a user, I see my personal details highlighted before sending, so I know what MIRAGE found.
- As a user, I see a preview of exactly what will be sent, so I can trust it.
- As a user, I read the AI's answer with my real name and numbers back in place.
- As a user, I am stopped with a clear warning when I paste an API key or password.
- As a user, I can pause MIRAGE for one message, or mark a word as safe, when it flags something wrongly.

Core flow (8 steps, 1 decision — "Only tokens leave the device; secrets never do"):

```
Type prompt → Scan on device → Secret found?
   yes → Block and warn → (user removes it, types again) → Type prompt
   no  → Mask to tokens → User previews → Send masked (tokens only, e.g. «PAN_1»)
       → AI replies → Restore values (on the device only)
```

The only branch is the secret check: a secret is never tokenized, it is blocked until the user removes it.

## Functional requirements

P0 is the complete demoable product; P1 makes it pleasant to use; P2 waits until P0 and P1 work.

| ID | Requirement | Priority | Done when |
|---|---|---|---|
| F1 | Intercept the prompt on ChatGPT and Gemini before it is sent (Enter key and send button) | P0 | Nothing is sent until MIRAGE has scanned it |
| F2 | Detect personal data and secrets with on-device rules (see Detection rules) | P0 | All P0 entity types found in the test set |
| F3 | Replace personal data with numbered tokens, e.g. «PERSON_1», «PAN_1» | P0 | Same value always gets the same token within a chat |
| F4 | Block the send when a secret is found, and show which text caused it | P0 | Test secrets never reach the chatbot |
| F5 | Store token-to-value pairs in an encrypted vault in extension storage | P0 | Vault unreadable without the extension's key |
| F6 | Replace tokens in the AI's reply with real values, on screen only | P0 | Restored text shows in the page; the provider never receives it |
| F7 | Preview panel showing exactly what will be sent | P0 | User can send or cancel from the panel |
| F8 | On/off switch and "allow once" for a single prompt | P1 | Toggle in the extension popup |
| F9 | Safe list: words the user marks as not personal | P1 | A marked word is never masked again |
| F10 | Custom list: names or terms the user always wants masked | P1 | Custom terms masked in every prompt |
| F11 | Name detection (names are hard for rules alone) | P1 | See Architecture: on-device list first, AWS Comprehend optional |
| F12 | Local stats page: counts of items masked and secrets blocked, no content | P2 | Counts only; no prompt text stored |
| F13 | Clear vault button and auto-clear after 24 hours | P2 | Vault empty after clear or timeout |

## Detection rules

Two policies only: personal data is masked (it can be restored), secrets are blocked (they never leave). Every rule runs on the device.

| Entity | How it is detected | Policy | Priority |
|---|---|---|---|
| Aadhaar | 12 digits, optional spaces as 4-4-4, verified with the Verhoeff check digit | Mask | P0 |
| PAN | 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F) | Mask | P0 |
| Indian mobile | 10 digits starting 6–9, optional +91 or 0 prefix | Mask | P0 |
| Email | Standard email pattern | Mask | P0 |
| UPI ID | name@handle with no dot after @ (tells it apart from email) | Mask | P0 |
| Card number | 13–19 digits that pass the Luhn check | Block | P0 |
| API key | Known prefixes (sk-, AKIA, ghp_, AIza) or long random-looking strings | Block | P0 |
| Password | Value after words like password, pwd, pass | Block | P0 |
| OTP | 4–8 digits near the word OTP or code | Block | P0 |
| IFSC | 4 letters, a 0, then 6 letters or digits | Mask | P1 |
| Person name | User's custom list; optional AWS Comprehend | Mask | P1 |
| Voter ID, GSTIN, address | Format patterns | Mask | P2 |

Health results are not masked: once the name and IDs are masked, the health detail is no longer tied to a person, and the AI still needs it to answer.

Build every rule with unit tests: 5 valid examples and 5 look-alikes that must not match (for example, a 12-digit order number that fails the Verhoeff check).

## Non-functional requirements

Privacy is the product, so the privacy rules below are hard requirements, not nice-to-haves.

| Area | Requirement |
|---|---|
| Privacy | Original values never leave the device in local-only mode. No prompt text is ever logged, stored on a server or sent to analytics. |
| Privacy (AWS mode) | Only text with IDs and secrets already removed may go to AWS, only for name detection, processed in memory and not stored. |
| Security | Vault encrypted with AES-GCM via the browser's Web Crypto API; key held by the extension only. |
| Security | Minimal extension permissions: only chatgpt.com and gemini.google.com host access. |
| Performance | Local scan adds under 200 ms for a 2,000-character prompt. |
| Reliability | If MIRAGE fails, it blocks the send and shows an error, never silently sends raw text. |
| Usability | Zero setup: install and it works on the next prompt. |
| Transparency | Open-source repo, with a plain-language README of what is and is not protected. |

The reliability rule matters most: a privacy tool that fails open is worse than none, because the user believes they are protected.

## Architecture

Build local-first: the whole P0 product runs inside the Chrome extension with no server. AWS is an optional add-on for better name detection, added only after P0 works.

Architecture (3 zones — "Real values stay in the browser; the AI sees only tokens"):

- **Your browser · trusted**
  - Content script: catches Enter and Send, shows the preview, restores the reply.
  - Detector: ID and secret rules, Aadhaar checksum.
  - Token vault: AES-GCM, on device, clears after 24 h.
- **AWS Mumbai · optional**: Name check (Lambda) — Amazon Comprehend finds names, nothing stored. Receives only text with IDs and secrets removed. Talks to the detector side only.
- **AI provider · untrusted**: ChatGPT, Gemini — receives tokens only, never real values. Masked prompt out, reply with tokens back.

The masked prompt goes straight from the browser to the chatbot; AWS is never on that path.

Why local-first, given the AWS decision is still open:

- The demo works with no AWS account, no cost and no internet dependency beyond the chatbot itself.
- It keeps the strongest privacy claim: in local-only mode, nothing leaves the device except tokens.
- AWS adds real value later for names, which rules cannot catch well, and gives you AWS experience for your resume.

If you add AWS: one Lambda function behind API Gateway, calling Amazon Comprehend's PII detection, in the Mumbai region (ap-south-1). Check the current AWS Free Tier terms before starting, and set a billing alarm on day one.

## Tech stack and repo structure

> Superseded by docs/tech-stack.md (WXT + React). Kept for reference.

One language (TypeScript) for the whole P0 product keeps a solo build simple; Python appears only if you add the AWS Lambda.

| Layer | Choice | Why |
|---|---|---|
| Extension | Chrome Manifest V3, TypeScript | Current Chrome extension standard; types catch mistakes early |
| Build | Vite | Fast rebuilds while you test on ChatGPT |
| UI (preview panel, popup) | Plain TypeScript + CSS | Small UI; no framework needed |
| Detection | Regex rules + checksum functions (Verhoeff, Luhn) | Runs on device, no internet |
| Vault | chrome.storage.local + Web Crypto (AES-GCM) | Encrypted, stays in the browser |
| Tests | Vitest | Unit tests for every detection rule |
| AWS (optional) | API Gateway, Lambda (Python), Amazon Comprehend | Name detection only |
| Repo | GitHub, public, MIT licence | Resume link; shows your commits |

## Build plan

> Superseded by the milestone plan (M0–M7) in the Implementation Plan.

Phase 1: Detector (no browser yet). Exit check: all P0 rules pass their unit tests.
Phase 2: Extension shell. Exit check: typing a PAN in ChatGPT shows it highlighted.
Phase 3: Mask, block, restore (the MVP). Exit check: the full demo works on ChatGPT.
Phase 4: Polish and Gemini. Exit check: works on both sites; popup settings saved.
Phase 5: Showcase (and optional AWS). Exit check: public repo a recruiter can understand in 2 minutes.

## Testing and demo

The test prompt set is what turns the success-metric targets into real numbers you can put in the README.

Test prompt set (test-prompts/prompts.json), 50+ prompts:

- 20 prompts with personal data (names, Aadhaar, PAN, phone, email, UPI), each item labelled.
- 15 prompts with secrets (fake API keys, card numbers that pass Luhn, passwords, OTPs).
- 15 normal prompts with look-alikes that must not be flagged (order numbers, dates, prices, code without keys).

Use only made-up data: test Aadhaar numbers you generate with a valid check digit, never real ones.

Demo script (2 minutes):

1. Open ChatGPT with MIRAGE on. Type: "I'm Priya Nair, PAN ABCDE1234F, phone 98450 12345. Write a leave mail to my HOD."
2. Show the highlights and the preview: the AI will receive «PERSON_1», «PAN_1», «PHONE_1».
3. Send. Show the reply with the real name and phone restored on screen.
4. Paste code containing a fake API key. Show the send being blocked with a warning.
5. Close on the README numbers from the test set.

## Risks, open questions and roadmap

The biggest risk is the chatbot sites themselves: ChatGPT and Gemini change their page structure, which can break interception without warning.

| Risk | Impact | Mitigation |
|---|---|---|
| Site layout changes break the content script | Prompts not intercepted | Keep page selectors in one file; fail closed if the prompt box is not found |
| AI rewrites a token ("your PAN" instead of «PAN_1») | Value not restored | Tell the AI in a short prefix to keep tokens unchanged; report restore rate honestly |
| Rules flag normal text (false positives) | Annoyed users switch it off | Look-alike tests, safe list, "allow once" |
| Names missed by rules | Name reaches the AI | Custom list in P1; optional Comprehend check |
| Unexpected AWS bill | Cost | Local-first; billing alarm before any AWS work |

Open questions:

- [ ] Add AWS at all, or stay local-only? Decide after Phase 3.
- [x] Show masking live while typing, or only at send time? — Decided in App Flow: detect live, mask at send.
- [ ] Should the token-keeping prefix be visible to the user in the preview?

Roadmap after v1 (not now):

- Claude and other chatbots
- PDF and image uploads (Amazon Textract, if using AWS)
- Hindi and other Indian-language prompts
- Firefox and Edge store listings
- A small-office version with shared rules
