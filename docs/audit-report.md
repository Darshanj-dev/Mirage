# MIRAGE — Audit and upgrade report

2026-09-29. Scope: the whole repository at commit `a806fb8` (M5), audited, fixed and upgraded without rebuilding it. All claims below were tested; how is stated next to each.

## 1. What was already there

A well-built Manifest V3 Chrome extension (WXT, TypeScript strict, React in Shadow DOM), local-only, no backend:

- Send interception on `window` capture at `document_start`, failing closed.
- On-device detector: Aadhaar (Verhoeff), PAN, phone, email, UPI, IFSC, cards (Luhn), 9 key formats + entropy, passwords, OTPs; overlap rules; safe words; Always-hide list.
- Reversible `«TYPE_n»` placeholders, AES-GCM-256 vault (non-extractable key, per-record IV, storage key as AAD, 24-hour sweep).
- Preview and block panels, restore in replies, "Copy with details", popup, welcome page, 386 tests.

Kept as-is: vault, tokenizer, message validation, fail-closed guard, Shadow-DOM UI, the privacy rules in `CLAUDE.md`.

## 2. What was broken (found and reproduced)

| # | Problem | How found | Severity |
|---|---|---|---|
| B1 | **Signed-out ChatGPT was not protected at all.** Its composer is now `textarea#mobile-composer-prompt`; no selector matched, so Enter sent the raw prompt (MIRAGE only showed "can't protect this page"). | Live run, Chrome 153 | Critical |
| B2 | The editor could not write placeholders into a `<textarea>` composer. | Code + live | High |
| B3 | Password in `postgres://admin:S3cr3tPass@db` was read as an **email**: hidden and stored instead of blocked. | Detector probe | High |
| B4 | Non-breaking spaces, zero-width characters, full-width/Devanagari digits and Cyrillic look-alikes slipped past every rule. | Probe | High |
| B5 | Per-site on/off settings were saved but never applied. | Code | Medium |
| B6 | Restore wrote real values into **any** text node on the page with a known placeholder (a page or injected reply could plant `«PAN_1»` anywhere and get it filled in). | Code | Medium |
| B7 | A chatbot page's content script could turn protection off, clear the vault, or read another site's saved details. | Code | Medium |
| B8 | Placeholder writing stalled half-way in background tabs (`requestAnimationFrame` never fires). | Live run | Medium |
| B9 | "Edit message" boxes were not guarded (a second way to send). | Code | Medium |
| B10 | MIRAGE flagged its own `«…_REMOVED»` placeholders as secrets on a re-check. | Live run | Low |
| B11 | Missed: names, DOB, bank accounts, IP addresses, AWS secret keys, `.env`/JSON secrets, bearer tokens, URL credentials, lowercase PAN, 12+ key formats. | Probe | Medium |
| B12 | Deck vs. code: the pitch promised Comprehend, Bedrock Guardrails, Cognito, DynamoDB and a dashboard; none exist (and Guardrails would send prompts to AWS, contradicting "local only"). | Review | Honesty |

## 3–5. What was fixed, improved and added

**Detection engine** (`lib/detector/`, see `docs/detection.md`): canonical-text layer with offset mapping; context scoring; confidence, severity, category, reason and recommended action on every finding; new rules for private keys, connection-string/URL passwords, secret assignments, AWS secret keys, bearer tokens, 20+ key formats, bank accounts, DOB, IPv4, names from context, health terms (flag only); category switches.

**Risk engine** (`lib/risk.ts`): transparent 0–100 score, documented weights, combination bonuses, severity floors; the panel shows the breakdown.

**Platform adapters** (`lib/sites/`): one file per site (ChatGPT both layouts, Gemini, Claude, Copilot, Perplexity), a shared core, and a fallback that finds the composer when every selector misses (badge shows "limited"). Edit-message boxes guarded. Per-site switches enforced.

**Send flow and UI**: one review panel for every level — risk chip, what was found, exactly what the AI will see, **Protect & send / Review / Edit prompt / Send anyway**. Review shows reasons, confidence and per-item Hide/Keep. Secrets become named placeholders (`«AWS_SECRET_KEY_REMOVED»`), never stored; sending a secret needs a second confirm and is impossible while *Block secrets* is on. Clean prompts pass through untouched (the user's own key press), so MIRAGE stays invisible when there is no risk.

**Output protection**: replies are read after they stop streaming; secrets and high-severity IDs trigger a small notice with *Show me*; the reply is never changed. The user's own restored values are never reported.

**Popup and settings**: dashboard (today's checked/hidden/stopped/reply warnings, platforms, local-processing line) and a settings page (protection mode, block secrets, reply check, reveal mode, 7 detection categories, 5 platforms, words, plain privacy statement).

## 6. Security improvements

- Content scripts are less trusted than MIRAGE's own pages: they may only use their own site's vault records, may turn protection on but never off, and cannot clear the vault, replace the Always-hide list or change security settings (`isAllowedFrom`, `lib/messages.ts`; tested).
- Message size limits (≤ 200 findings, ≤ 500 chars each, ≤ 500 tokens).
- Restore only inside conversation messages, only text nodes (never attributes, so no URL exfiltration), and an optional hover-only mode that never writes values into the page.
- Guard: clean-prompt pass-through fails closed (a throwing check stops the send); allow-window after MIRAGE's own send is 1.5 s and only after the box has been protected.

## 7. Privacy improvements

- No network requests, no backend, no analytics (verified: the extension makes no requests; the E2E checks every request the page makes).
- Secrets are never stored or tokenized; removed-secret placeholders carry no number and cannot be restored.
- Only counts are stored in stats (sanitized in the service worker).
- `nameCheck` (AWS) remains a stub; no AWS path sends prompt text.

## 8. Performance

- Detection: 0.05 ms mean per prompt, 1.8 ms for 2,000 characters, 8 ms for 20,000 (was < 200 ms budget).
- Live, from Enter to review panel: ChatGPT 68 ms, Gemini 55 ms, Perplexity 32 ms.
- Reply check reads a reply once, 1.2 s after its last change, and only if its text changed.
- Build: 620 kB total (React is bundled into the content script; the largest remaining cost).

## 9. Supported platforms

| Platform | Status | Verified |
|---|---|---|
| ChatGPT (signed in, ProseMirror) | Supported | Team, live, 2026-09-28 |
| ChatGPT (signed out, textarea) | Supported | Automated live E2E, 2026-09-29 |
| Gemini | Supported | Automated live E2E, 2026-09-29 |
| Perplexity | Supported | Automated live E2E, 2026-09-29 |
| Claude | Beta | Needs sign-in; selectors from public structure + fallback, not yet verified live |
| Copilot | Beta | Needs sign-in; same |
| Firefox | Builds (`wxt build -b firefox`) | Not run; CSS Highlight API needs Firefox 140+ |

## 10. Threat model

**Trusted**: MIRAGE's service worker and extension pages; the browser; the user.
**Partly trusted**: the content script (runs in the chatbot page's renderer process).
**Untrusted**: the chatbot page and its scripts, AI replies (may carry prompt injection), other extensions, anything typed or pasted.

**Trust boundaries**: (1) page ⇄ content script (DOM only; UI in Shadow DOM), (2) content script ⇄ service worker (validated, sender-checked messages), (3) browser ⇄ AI provider (only the protected prompt crosses).

| Threat | Mitigation | Residual risk |
|---|---|---|
| Provider logs/trains on prompts | Placeholders and removal before send; verified no raw value in any request | Names without context, free-text addresses, other languages |
| Page reads the composer before send | — | **Not preventable in-page**: text in the site's own box is visible to the site's scripts. MIRAGE protects what is *submitted*. |
| Malicious reply / prompt injection plants `«PAN_1»` | Restore only in message containers, text nodes only, per-chat vault; hover-only mode | In inline mode a restored value sits in the page DOM, readable by the page |
| Message spoofing from a compromised page | Sender check, per-sender permissions, per-site vault access | A compromised renderer can still read its own site's saved values |
| Storage theft (disk/profile copy) | AES-GCM vault, non-extractable key, 24-hour sweep | Key lives in the same profile: protects against casual reads, not full profile compromise |
| Other malicious extensions | — | Out of scope for any extension |
| Detection bypass (look-alikes, splitting) | Canonical layer, context rules | Base64-encoded secrets, secrets split across lines, images/files |
| Supply chain | 2 runtime deps (React); dev-only test deps | Standard npm risk |
| Logging secrets | No `console.log` in shipped code; errors report kind only | — |

## 11. Known limitations

- File uploads, images, voice input and Canvas are not checked.
- Names are found only from context ("my name is…", "Dr.", "I'm A B") or the Always-hide list; addresses are not detected.
- English prompts only; Indian-script digits are read, Indian-script words are not.
- Signed-out ChatGPT keeps the protected text in the box after sending (the site's behaviour); Claude/Copilot unverified.
- Site-side anti-bot checks can hold a programmatic send; the prompt is already protected, so pressing Enter again sends it natively.

## 12–14. Test results, accuracy, latency

- **Unit/integration**: 744 tests pass (`npm test`), including DOM tests for adapters and the send guard (happy-dom), sender permissions, risk scoring and every rule (5+ matches, 5+ look-alikes).
- **Detector** (`npm run eval`, 181 prompts): precision 1.000, recall 0.996, F1 0.998; **false-positive rate 0/28** on clean prompts. See the caveat in `docs/detection.md`.
- **Live E2E** (`npm run e2e`, demo prompt with AWS key id + secret, PAN, email, phone): ChatGPT, Gemini and Perplexity all pass — intercepted, reviewed, sent protected, **0 raw values in all outgoing requests**.

## 15. Remaining technical debt

- `useSendFlow`/`MirageApp` are large; the review state could move into a reducer.
- React in the content script (~220 kB); a lighter UI layer would cut load time.
- The welcome page still describes two platforms' worth of demo; its text was updated but not redesigned.
- Selector freshness has no monitor: `npm run e2e` should run on a schedule.
- `docs/schema.md` and `docs/app-flow.md` predate this upgrade (see this report and `docs/detection.md`).

## 16. Future improvements

1. Blind test set written by someone outside the team; publish the numbers.
2. Verify Claude and Copilot live; add their reply action bars for "Copy with details".
3. File-upload checks (text files and PDFs read locally before upload).
4. Local NER model (optional, in an offscreen document) for names and addresses without context.
5. A CLI/pre-commit hook sharing `lib/detector` for developer workflows (API calls, agents).
6. Enterprise policy via managed storage (`chrome.storage.managed`), still with no prompt leaving the device.
