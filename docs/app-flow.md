# MIRAGE — App Flow

Sep 28, 2026 · Ninad Pandith M N

> Where wording differs from docs/content.md, docs/content.md wins.

## Key decisions

MIRAGE highlights live while you type, masks only at the moment of sending, and shows a preview only when there is something to protect. Clean prompts send with zero delay.

| Decision | Choice | Why it makes MIRAGE feel special |
|---|---|---|
| When to detect | Live, 300 ms after the user stops typing | The user watches protection happen; it builds trust before they hit Send |
| When to mask | Only at send time | The user keeps editing natural text; tokens exist only in what leaves the device |
| When to preview | Only when something was found | No friction on normal prompts |
| Preview style | Full panel for the first 5 protected sends, then the user can switch to Quick mode (a small "3 items protected" chip) | Teaches the user once, then gets out of the way |
| Secrets | Hard block, with a one-click "Remove secret and send" fix | Blocking without a fix is annoying; the fix makes blocking feel helpful |
| Restored values | Shown with a faint dotted underline; hover says "Restored on your device. The AI saw «PAN_1»" | Proof, right in the reply, that the AI never saw the real value |
| Copying a reply | "Copy restored" button beside each reply | The chatbot's own copy button would copy tokens |

This document builds on the MIRAGE PRD. Requirement IDs (F1–F13) refer to it.

## Surfaces

MIRAGE adds eight small pieces of UI; everything except the popup and welcome page lives inside the chatbot page.

| ID | Surface | Where it appears | Purpose | Priority |
|---|---|---|---|---|
| S1 | Shield badge | Bottom-right corner of the prompt box | Shows status at a glance: grey (off), blue (on, nothing found), blue with a count (items found), red (secret found) | P0 |
| S2 | Inline highlights | Under words in the prompt box | Blue underline = will be masked; red underline = secret; hover shows the token it becomes | P0 |
| S3 | Preview panel | Slides up above the prompt box on Send | Shows exactly what will be sent; buttons: Send protected, Cancel, Allow once | P0 |
| S4 | Block panel | Same place as S3, in red | Explains the secret found; buttons: Remove secret and send, Edit prompt | P0 |
| S5 | Restored reply | Inside the AI's reply | Real values with a dotted underline; hover tooltip; "Copy restored" button | P0 (copy: P1) |
| S6 | Protected-message receipt | Small shield icon on each sent message | Click to see what was protected in that message | P1 |
| S7 | Popup | Toolbar icon | On/off, Quick mode, safe list, custom list, clear vault, stats | P1 |
| S8 | Welcome page | Opens once after install | 30-second interactive demo | P1 |

Visual style: one blue for "protected", one red for "blocked", nothing else coloured. The chatbot's own design stays untouched.

## First run

A new user goes from install to their first protected prompt in under a minute, without reading any instructions.

1. User installs MIRAGE from the Chrome Web Store (or loads it unpacked during development).
2. The welcome page (S8) opens in a new tab with one sentence: "MIRAGE hides your personal details from AI chatbots."
3. The page shows a fake chat box with a sample prompt already typed: "I'm Priya Nair, PAN ABCDE1234F." Highlights appear on the name and PAN.
4. User clicks See what the AI receives. The text animates into "I'm «PERSON_1», PAN «PAN_1»."
5. User clicks See the reply. A sample reply appears with the real name restored and the hover tooltip shown.
6. Final card: "You're protected on ChatGPT and Gemini. Pin MIRAGE to your toolbar." with an arrow toward the puzzle-piece icon, and an Open ChatGPT button.
7. On ChatGPT, the shield badge (S1) pulses once so the user notices it.

Nothing is sent anywhere during the welcome demo; it runs entirely in the page. If the user skips the welcome page, MIRAGE still works; the badge pulse is enough.

## Main user flow

There are exactly three ways a prompt can leave the prompt box: sent as typed (nothing found), sent masked (personal data found), or stopped (secret found).

```
User types (in ChatGPT) → Live scan (on the device) → Found?
  nothing → Send as typed (no delay)
  PII     → Preview panel (or Quick chip) → [Send protected] → Masked sent (tokens only)
            → AI replies → Reply restored (on screen only)
  secret  → Block panel (send stopped)
            → [Remove secret] → Preview panel
            → [Edit prompt]   → User types
```

Not drawn, to keep it readable: Cancel on the preview panel returns to typing with the text unchanged, and Allow once sends the original text after a confirm ("Send without protection?"). In Quick mode the preview panel is replaced by a 2-second chip, "3 items protected", and the masked prompt sends immediately.

## Screen states

Each surface has a small, fixed set of states. (Exact wording: see docs/content.md, Microcopy library.)

### Shield badge (S1)

| State | Looks like | Tooltip |
|---|---|---|
| Off | Grey shield | "MIRAGE is paused. Click to turn on." |
| On, nothing found | Blue outline shield | "MIRAGE is watching this prompt." |
| Items found | Blue filled shield with a count, e.g. 3 | "3 items will be masked before sending." |
| Secret found | Red shield with ! | "This prompt contains a secret. Sending is blocked." |
| Error | Grey shield with ! | "MIRAGE couldn't check this prompt. Sending is paused." |

### Preview panel (S3)

- Title: "The AI will receive this"
- Body: the masked prompt, with each token as a blue pill; hover a pill to see its real value.
- Footer line: "3 items protected · real values stay on this device"
- Buttons: Send protected (primary, Enter key), Cancel (Esc), Allow once (text link).
- After the 5th protected send, a one-time line: "Skip this preview next time? Turn on Quick mode."

### Block panel (S4)

- Title: "Sending blocked: this looks like an API key" (or password, card number, OTP).
- Body: the prompt with the secret shown as sk-•••••7f2a (first 3 and last 4 characters only).
- Buttons: Remove secret and send (replaces it with «SECRET_REMOVED», then continues to the preview), Edit prompt.
- No "send anyway" button: secrets are never sent.

### Restored reply (S5)

- Real values appear with a faint dotted underline.
- Hover: "Restored on your device. The AI saw «PAN_1»."
- A Copy restored button beside the chatbot's own copy button.
- If a token could not be restored (the AI changed it), the raw token stays visible with an amber dotted underline and the tooltip "The AI changed this token, so MIRAGE couldn't restore it."

## Edge and error flows

The rule for every failure is the same: never send raw text silently. When in doubt, pause and tell the user.

| Situation | What the user sees | What MIRAGE does |
|---|---|---|
| Prompt box not found (site redesign) | Grey badge with !: "MIRAGE can't protect this page right now." | Stops intercepting; does not block the site. User is warned instead |
| Detector throws an error | Error badge; Send shows "Couldn't check this prompt" with Retry and Allow once | Blocks the send until the user chooses |
| User pastes a very long prompt (over 20,000 characters) | Badge shows a spinner while scanning | Scans in chunks; send waits for the result |
| Same value appears twice | Both become the same token, e.g. «PAN_1» twice | Consistent tokens keep the AI's answer coherent |
| User edits a masked prompt after Cancel | Original text, highlights refresh | Old tokens for that draft are discarded |
| AI changes a token | Amber underline on the raw token (see Screen states) | Counts it as a restore failure in local stats |
| User opens an old chat after 24 hours | Tokens shown raw with an amber note: "Values cleared after 24 hours" | Vault auto-clear (F13) has removed them |
| MIRAGE turned off | Grey badge; no highlights | Everything passes through; a red dot on the toolbar icon as a reminder |
| Unsupported chatbot (e.g. Claude) | Nothing on the page; popup says "Not supported yet" | No interception |
| Allow once used | Confirm dialog: "Send without protection?" | Sends original text; logs only the count, not the content |

## Technical event flow

The content script runs inside the chatbot page and does the interception; the service worker (the extension's background script) owns the vault and is the only part that may call AWS.

Sequence (User, Content script, Detector, Service worker, Chatbot, AWS optional) — "Only the masked prompt ever reaches the chatbot":

1. User → Content script: types
2. Content script → Detector: scan(text), 300 ms
3. Detector → Content script: findings
4. Content script → User: highlights, badge
5. User → Content script: presses Send
6. Content script → Service worker: TOKENIZE
7. Service worker → AWS: name check, IDs removed (optional, dashed)
8. AWS → Service worker: name positions (optional, dashed)
9. Service worker → Content script: tokens (vault saved)
10. Content script → User: preview panel
11. User → Content script: Send protected
12. Content script → Chatbot: **masked prompt only**
13. Chatbot → Content script: reply with tokens (streamed)
14. Content script → Service worker: RESTORE
15. Service worker → Content script: real values
16. Content script → User: restored reply

The dashed AWS pair is skipped entirely in local-only mode. Everything above the masked-prompt arrow happens before a single byte reaches the chatbot.

Key implementation notes:

1. **Intercepting Send.** Listen for keydown (Enter without Shift) and click on the send button in the capture phase, call preventDefault() and stopPropagation(), then re-trigger the send yourself after masking.
2. **Writing the masked text.** Set the prompt box's text, then dispatch an input event so the chatbot's own code sees the change before sending.
3. **Watching replies.** A MutationObserver on the chat area finds new reply text; replace tokens in text nodes only, so the chatbot's formatting stays intact.
4. **Page selectors.** Keep every ChatGPT and Gemini selector in one file (sites.ts), so a site redesign is a one-file fix.

## Message contracts

The parts talk through six internal messages (via chrome.runtime.sendMessage) plus one HTTPS call to AWS; fixing their shapes up front lets you build each part separately and test it alone.

| Message | From → To | Sends | Gets back |
|---|---|---|---|
| TOKENIZE | Content script → Service worker | chatId, findings (type, value) | token for each value |
| RESTORE | Content script → Service worker | chatId, tokens found in the reply | real value for each token (missing ones left out) |
| NAME_CHECK | Service worker → AWS (HTTPS) | text with IDs and secrets already replaced | name positions (start, end, score) |
| GET_SETTINGS | Content script or popup → Service worker | nothing | enabled, quickMode, safeList, customList |
| SET_SETTINGS | Popup → Service worker | changed settings | saved settings |
| CLEAR_VAULT | Popup → Service worker | nothing | number of pairs cleared |
| GET_STATS | Popup → Service worker | nothing | counts: masked, blocked, restore failures |

The Implementation Plan adds a seventh internal message, COUNT (content script → service worker), which reports counts only (hidden, blocked, restore failures, allow once) — never content.

The detector is a plain function inside the content script, not a message, so it can be unit-tested without Chrome:

```ts
type Policy = 'mask' | 'block';

interface Finding {
  type: 'AADHAAR' | 'PAN' | 'PHONE' | 'EMAIL' | 'UPI' | 'IFSC'
      | 'NAME' | 'CARD' | 'API_KEY' | 'PASSWORD' | 'OTP';
  start: number;   // index in the prompt text
  end: number;
  value: string;
  policy: Policy;  // secrets are always 'block'
}

function detect(text: string, settings: Settings): Finding[];
```

chatId is taken from the chat's URL, so tokens stay consistent within one conversation and never mix between chats.

## Popup and settings

The popup (S7) is one screen, no menus; every setting is one click away, and most users will only ever use the on/off switch.

Layout, top to bottom:

1. Header: MIRAGE shield and a large on/off switch.
2. Status line: "Protecting chatgpt.com" (or "Not supported on this site yet").
3. This week: "42 items masked · 3 secrets blocked". Counts only, never content.
4. Quick mode switch: skip the preview panel.
5. Safe words: chips with an x to remove; words here are never masked.
6. Always mask: chips for names or terms the user adds (e.g. their own name, their company).
7. Clear stored values button, with a confirm: "Remove all saved values? Old replies will show tokens."
8. Footer: "Everything stays on this device" and a link to the GitHub repo.

Shortcuts from the page itself, so users rarely need the popup:

- Hover a blue highlight → Not personal adds it to Safe words.
- Select any text in the prompt box, right-click → Always mask this adds it to Always mask.
- Turning MIRAGE off shows a red dot on the toolbar icon until it is turned back on.

## Traceability to the PRD

| PRD requirement | Covered by |
|---|---|
| F1 Intercept send | Main user flow; Technical event flow, note 1 |
| F2 Detect on device | Live scan state; detect() contract |
| F3 Numbered tokens | TOKENIZE message; Edge flows (same value twice) |
| F4 Block secrets | Block panel (S4); Main flow, secret branch |
| F5 Encrypted vault | Service worker owns the vault |
| F6 Restore on screen | Restored reply (S5); RESTORE message |
| F7 Preview panel | Preview panel (S3) |
| F8 On/off, allow once | Popup; Preview panel's Allow once |
| F9 Safe list | Popup Safe words; "Not personal" on hover |
| F10 Custom list | Popup Always mask; right-click shortcut |
| F11 Name detection | NAME_CHECK message (optional AWS) |
| F12 Local stats | GET_STATS; popup "This week" |
| F13 Clear vault | CLEAR_VAULT; 24-hour edge flow |

New in this document (add to the PRD as P1):

- [ ] Quick mode (preview replaced by a chip after 5 protected sends)
- [ ] Remove secret and send (one-click fix on the block panel)
- [ ] Copy restored button, and the welcome-page demo
