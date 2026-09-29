# MIRAGE: the AI privacy firewall

Checks every prompt **on your device** before it reaches ChatGPT, Gemini, Claude, Copilot or Perplexity. Personal details become placeholders like `«PAN_1»`, secrets like API keys are removed, and you decide before anything is sent. Real details come back in the reply, on your device.

```
WITHOUT MIRAGE   Aadhaar · PAN · API key  ─────────────────────▶  AI provider

WITH MIRAGE      Aadhaar · PAN · API key ─▶ MIRAGE (in your browser)
                                             │ detect · score · you choose
                                             ▼
                                   «AADHAAR_1» «PAN_1» «API_KEY_REMOVED» ─▶ AI provider
```

## How it works

1. **Type** a prompt as usual.
2. **Detect** — local rules with checksums (Aadhaar Verhoeff, card Luhn), 20+ key formats, entropy, and context ("my name is", "DOB", "account no"). Look-alike characters are normalized first.
3. **Score** — a 0–100 privacy risk with every point explained ([docs/detection.md](docs/detection.md)).
4. **Choose** — *Protect & send*, *Review* (per-item Hide/Keep, reasons, confidence), *Edit prompt*, or *Send anyway* (secrets need a second confirm, or are blocked outright).
5. **Put back** — placeholders in the reply show your real details, on your device only.
6. **Reply check** — MIRAGE says when a reply contains a secret or ID number. It never changes the reply.

Nothing is sent to MIRAGE: there is no server. The prompt is never changed without you seeing it (Quick mode, if you turn it on, shows a chip after hiding personal details; secrets always ask).

## What it protects

| Removed (never stored) | Hidden (put back in the reply) | Flagged (kept) |
|---|---|---|
| API keys & tokens (OpenAI, Anthropic, AWS, GitHub, GitLab, Google, Slack, Stripe, npm, Hugging Face, SendGrid, JWT, bearer…), private keys, passwords incl. in connection strings/URLs, card numbers, OTPs | Aadhaar, PAN, phone, email, UPI, IFSC, bank account, IP address, date of birth, names (from context or your Always-hide list) | Health details (the AI needs them; the risk score rises when they sit next to your identity) |

## Results (measured 2026-09-29)

- **Detector**, 181 fictional prompts: precision 1.000, recall 0.996, F1 0.998, 0/28 false positives on clean prompts; 1.8 ms for 2,000 characters. Written by the same team as the rules — see the caveat in [docs/detection.md](docs/detection.md#results).
- **Live**: ChatGPT (signed out), Gemini and Perplexity — prompt intercepted in 32–68 ms, sent protected, **no raw value in any outgoing request**.
- **744 automated tests.**

## Limits

File uploads, images and voice are not checked. Names are found only from context or your list; addresses are not detected. English only. Claude and Copilot are **beta** (not yet checked live). A site's own scripts can see what you type in its box before you send — MIRAGE protects what is submitted. Full list: [docs/audit-report.md](docs/audit-report.md#11-known-limitations).

## Develop

```
npm install
npm test          # unit and DOM tests
npm run eval      # detector precision/recall/latency (EVAL_WRITE=1 writes docs/eval-results.json)
npm run build     # production build in .output/chrome-mv3
npm run e2e -- chatgpt gemini perplexity   # live check in your installed Chrome
```

To use it in your own Chrome: `npm run build`, open `chrome://extensions`, turn on Developer mode, **Load unpacked**, choose `.output/chrome-mv3`.

## Built with

WXT, TypeScript, React, Vitest, happy-dom, puppeteer-core (tests only).

## Team

Team Nexora, Presidency University, Bangalore — Ninad Pandith M, Kaushal Ramesh, Darshan J, Kishan D V.
