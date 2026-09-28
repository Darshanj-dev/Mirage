# MIRAGE — Tech Stack

Sep 28, 2026 · Ninad Pandith M N

## Stack at a glance

MIRAGE is built with WXT, TypeScript and React, with zero backend required. AWS is a plug-in you can add later if it becomes available.

| Layer | Choice | One-line reason |
|---|---|---|
| Extension framework | WXT | Handles the Manifest V3 setup, auto-reloads while you code, supports React |
| Language | TypeScript (strict mode) | Type errors catch AI-written mistakes before you run anything |
| UI | React, rendered inside a Shadow DOM | AI assistants write React most reliably; Shadow DOM stops ChatGPT's styles breaking ours |
| Styling | Plain CSS files | Works cleanly inside Shadow DOM; nothing extra to configure |
| Detection | Own TypeScript module (regex, Verhoeff, Luhn) | No libraries needed; fully testable |
| Storage | chrome.storage.local + Web Crypto (AES-GCM) | Built into Chrome; encrypted; stays on the device |
| Messaging | chrome.runtime messages with a typed helper | Built in; matches the App Flow message contracts |
| Tests | Vitest | Same config as WXT; fast |
| Runtime & tools | Node.js LTS, npm, Git, GitHub | Standard, well documented on Windows |
| AI coding tool | Claude Code, Cursor or similar | Reads the rules file in this doc |
| Optional cloud | AWS Lambda (Python) + API Gateway + Amazon Comprehend | Only for name detection, only if credits are available |

This document follows the MIRAGE PRD and App Flow. It replaces the PRD's "Vite + plain TypeScript UI" choice with WXT + React (WXT uses Vite underneath).

## Why this stack suits vibe coding

When an AI writes most of the code, the stack's job is to make mistakes loud and early, because you will not read every line.

- **Popular tools, fewer hallucinations.** React, TypeScript and Chrome's own APIs appear in huge amounts of public code, so AI assistants get them right far more often than niche libraries.
- **Strict TypeScript is your reviewer.** If the AI calls a function with the wrong data, the build fails with a clear message you can paste back to it.
- **Tests are your safety net for privacy.** The detector is pure functions; every rule gets tests, so "fix the PAN rule" can't silently break Aadhaar.
- **One framework, few moving parts.** WXT generates the manifest and reloads the extension on save, so you see results in seconds without learning Chrome's packaging.
- **No server to break.** Everything P0 runs in the browser, so there is no deployment, no API keys to leak, and no bill.

The working loop: describe one small task to the AI → it writes code and tests → run npm test and npm run dev → check ChatGPT → commit. One feature per commit, so any bad change is one undo away.

## Layer by layer

### Extension framework: WXT

- Creates the project, the Manifest V3 file and the build, from files in an entrypoints folder.
- Four entrypoints: content script (runs on ChatGPT and Gemini), background (the service worker), popup, and welcome page.
- Rule: host permissions only for chatgpt.com and gemini.google.com; add a site only when support for it is built.

### UI: React inside a Shadow DOM

- The shield badge, highlights, preview panel and block panel are injected into the chatbot page inside a Shadow DOM, using WXT's content-script UI helpers.
- The popup and welcome page are normal React pages.
- Rule: never touch the chatbot's own elements except the prompt box and reply text.

### Detection: own module, no libraries

- detect(text, settings) returns a list of findings (see App Flow, Message contracts).
- Checksums: Verhoeff for Aadhaar, Luhn for card numbers.
- Rule: every rule gets at least 5 matching and 5 non-matching test cases.

### Storage and encryption

- Vault: token-to-value pairs per chat, encrypted with AES-GCM using the browser's Web Crypto API, saved in chrome.storage.local.
- Settings and counts: chrome.storage.local, unencrypted (no personal data in them).
- Rule: only the service worker reads or writes the vault.

### Messaging

- One file defines the six internal message types with their data shapes; content script and popup call a typed sendMessage helper.
- Rule: messages never carry the whole prompt, only the findings or tokens needed.

### Testing

- Vitest for the detector, tokenizer and vault.
- A manual checklist on real ChatGPT and Gemini for interception and restore (page behaviour is hard to unit-test).
- Rule: npm test must pass before every commit.

## How the pieces fit

Two zones of your own code sit on two layers you don't write ("Everything runs in the browser; AWS is a side plug-in"):

- **Inside the chatbot page (content script):** React UI in Shadow DOM (badge, highlights, panels, restores reply text) → Detector module (regex, Verhoeff, Luhn; pure functions, fully tested).
- **Extension pages and worker:** Service worker (encrypted vault, handles messages), Popup (React, settings, stats), Welcome page (React, first-run demo). Typed messages connect the page UI to the service worker.
- **AWS (optional):** Lambda + Comprehend, name check only.
- Foundation: Chrome APIs (storage.local, runtime messages, Web Crypto); built with WXT, TypeScript and Vite; tested with Vitest.

If the AWS box is never added, nothing else in the picture changes.

## Windows setup

- [x] Node.js LTS (check: node -v)
- [x] Git for Windows (check: git --version)
- [x] VS Code
- [ ] Google Chrome, logged in to ChatGPT and Gemini
- [x] AI coding tool

Create the project: `npx wxt@latest init` with the React template and npm, then `npm install`, `npm install -D vitest`, `npm run dev`.

Testing on your real, logged-in Chrome: run npm run build, then open chrome://extensions, turn on Developer mode, click Load unpacked, and choose the .output/chrome-mv3 folder. After each rebuild, click the reload icon on the MIRAGE card.

Common Windows problem: if PowerShell says running scripts is disabled, run the commands in Command Prompt instead, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once in PowerShell.

## Project structure

WXT reads the entrypoints folder to build the extension; everything else lives in lib (logic, no UI) and components (React UI), so the AI always knows where new code goes.

```
entrypoints/
  content/index.tsx        # runs on ChatGPT and Gemini; mounts the UI
  background.ts            # service worker: vault + message handlers
  popup/                   # index.html, main.tsx, App.tsx
  welcome/                 # index.html, main.tsx, App.tsx
components/                # React: ShieldBadge, PreviewPanel, BlockPanel, Tooltip
lib/
  detector/                # detect.ts, rules.ts, verhoeff.ts, luhn.ts (+ .test.ts each)
  tokenizer.ts             # values to «TYPE_n» tokens (+ test)
  vault.ts                 # AES-GCM encrypt, decrypt, clear (+ test)
  messages.ts              # the message types and sendMessage helper
  sites.ts                 # ChatGPT and Gemini selectors, in one place
  settings.ts              # load and save settings
test-prompts/prompts.json  # the 50+ prompt test set
aws/                       # optional Lambda, added only if AWS is used
CLAUDE.md                  # rules for the AI coding tool
wxt.config.ts
README.md
```

Naming rules:

- React components in PascalCase (PreviewPanel.tsx); everything else in camelCase (verhoeff.ts).
- Tests sit next to the file they test, named *.test.ts.
- Token format is always «TYPE_n», e.g. «PAN_1», defined once in tokenizer.ts.

## Rules file for the AI coding tool

See CLAUDE.md in the project root.

## AWS: optional either way

MIRAGE is complete without AWS, and the AWS part is one switch in settings.

| Situation | What you do |
|---|---|
| No AWS access | Build and ship local-only. Names are caught by the user's Always mask list. |
| Hackathon provides AWS credits | Add the name check: one Lambda, one API Gateway endpoint, Amazon Comprehend, Mumbai region. |
| You use your own AWS account | Same as above, but set a billing alarm first and check the current Free Tier terms. |

If you add it, the pieces are:

- Lambda (Python): receives text with IDs and secrets already replaced, calls Comprehend's PII detection for names, returns only name positions.
- API Gateway (HTTP API): one POST endpoint, called only by the service worker.
- Settings switch: "Better name detection (uses AWS)", off by default, explained in plain words.

What the code needs to be ready for this now: the service worker calls the name check through one function, nameCheck(text), which returns an empty list in local-only mode. Adding AWS later means filling in that one function.

## What not to use

| Don't add | Why not | Revisit when |
|---|---|---|
| Tailwind or UI kits | Extra setup inside Shadow DOM; plain CSS is enough for four small panels | The UI grows past about 10 components |
| State libraries (Redux, Zustand) | React's own state covers a popup and a panel | Never, for v1 |
| NLP or ML libraries in the extension | Large downloads, slow on laptops | Names become the top complaint and AWS is unavailable |
| Any analytics or error-reporting service | Would send data off the device, breaking the core promise | Only with a consent switch, and never prompt text |
| A database or custom backend | Nothing to store server-side | A small-office version with shared rules |
| Plasmo or other extension frameworks | WXT already covers everything | WXT stops being maintained |
| Playwright end-to-end tests | Chatbot logins make them fragile | After v1, for the welcome page only |

Keep the dependency list short: WXT, React, and Vitest are enough for all of P0.
