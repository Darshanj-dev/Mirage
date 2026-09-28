# MIRAGE — Content Guidelines

Sep 28, 2026 · Ninad Pandith M N

## Voice

MIRAGE sounds like a calm friend who knows security: plain, brief, reassuring, and never scary. It protects quietly and explains only when it has to stop you.

Three traits:

- **Calm, not alarming.** Users paste personal data because they're busy, not careless. MIRAGE never scolds or uses fear.
- **Plain, not technical.** Say "your PAN number", not "PII entity of type IN_PERMANENT_ACCOUNT_NUMBER".
- **Brief, not chatty.** Most text is 3–8 words. The user came to talk to an AI, not to read MIRAGE.

| Situation | Do | Don't |
|---|---|---|
| Items found | "3 items will be hidden before sending." | "WARNING: Sensitive data detected!" |
| Secret found | "This looks like an API key. It won't be sent." | "Security violation! You leaked a credential." |
| Error | "MIRAGE couldn't check this prompt. Try again?" | "Error 0x4F: detector exception." |
| Success | "Protected." | "Your data is 100% safe forever!" |

This document builds on the MIRAGE PRD and App Flow; where wording differs, this document wins.

## Word list

Code and docs use technical words; anything a user reads uses the plain word in the second column.

| In code and docs | In the extension (user sees) | Example |
|---|---|---|
| mask | hide | "3 items will be hidden" |
| token | placeholder | "The AI sees a placeholder like «PAN_1»" |
| restore | put back / restored | "Restored on your device" |
| PII | personal details | "personal details like your PAN" |
| secret | secret (name the type) | "This looks like a password" |
| block | won't be sent | "It won't be sent." |
| vault | saved values | "Clear saved values" |
| AI provider | the AI, or the site name | "ChatGPT will see…" |
| allow once | send without hiding | "Send without hiding?" |

Never write these anywhere, in the extension, README, store listing or pitch:

- "100% secure", "unhackable", "guaranteed", "completely anonymous", "military-grade"
- "best", "revolutionary", "first-ever", "number one" (also against the hackathon rules)
- Blame words: "leak" (about the user), "mistake", "careless", "violation"
- Alarm words in the UI: "WARNING", "DANGER", "ALERT", exclamation marks
- Error codes, stack traces or "Oops!"

Brand name: always MIRAGE in capitals; never Mirage or mirage in user-facing text.

## Writing rules

1. Lead with what happens, not what MIRAGE detected. "3 items will be hidden" beats "Detected 3 PII entities".
2. Name the thing. "This looks like an API key", not "Sensitive content found".
3. Say "looks like" for detections. Detection can be wrong; "looks like" is honest and leaves room for the user.
4. Buttons are verbs, 1–4 words. "Send protected", "Edit prompt", "Remove secret and send". Never "OK" or "Yes".
5. Sentence case everywhere. "Send protected", not "Send Protected".
6. Every stop offers a way forward. A block always has a fix button; an error always has Retry.
7. Never show a real value in full outside the prompt box. Secrets show as sk-•••••7f2a.
8. Numbers as digits. "3 items", not "three items"; use "1 item" singular correctly.

Length limits:

| Element | Max length |
|---|---|
| Button | 4 words |
| Badge tooltip | 12 words |
| Panel title | 10 words |
| Panel body | 2 short sentences |
| Popup status line | 6 words |

## Microcopy library

Every string the extension shows, with the key it gets in the strings file; these replace the wording in the App Flow document. In `_locales/en/messages.json`, dots become underscores (badge.off → badge_off).

| Key | Text | Where |
|---|---|---|
| badge.off | MIRAGE is paused. Click to turn on. | Shield badge tooltip |
| badge.watching | MIRAGE is watching this prompt. | Shield badge tooltip |
| badge.found | {n} items will be hidden before sending. | Shield badge tooltip |
| badge.secret | This prompt has a secret. It won't be sent. | Shield badge tooltip |
| badge.error | MIRAGE couldn't check this prompt. | Shield badge tooltip |
| highlight.hover | Will be sent as {placeholder} | Hover on blue underline |
| highlight.notPersonal | Not personal | Hover button |
| preview.title | ChatGPT will see this | Preview panel |
| preview.footer | {n} items hidden · real details stay on this device | Preview panel |
| preview.send | Send protected | Button |
| preview.cancel | Cancel | Button |
| preview.allowOnce | Send without hiding | Text link |
| preview.confirmRaw | Send without hiding? ChatGPT will see your real details. | Confirm dialog |
| preview.quickOffer | Skip this preview next time? Turn on Quick mode. | After 5th protected send |
| quick.chip | {n} items hidden | Quick mode chip |
| block.title | This looks like {secretType}. It won't be sent. | Block panel |
| block.body | Secrets like this can give others access to your accounts. | Block panel |
| block.fix | Remove secret and send | Button |
| block.edit | Edit prompt | Button |
| restore.hover | Put back on your device. ChatGPT saw {placeholder}. | Hover on restored value |
| restore.failed | ChatGPT changed this placeholder, so MIRAGE couldn't put the detail back. | Amber underline hover |
| restore.expired | Details cleared after 24 hours. | Old chats |
| restore.copy | Copy with details | Button beside reply |
| error.check | MIRAGE couldn't check this prompt. | Send blocked on error |
| error.retry | Try again | Button |
| error.pageChanged | MIRAGE can't protect this page right now. Your prompts are not being checked. | Banner |
| popup.status | Protecting {site} | Popup |
| popup.unsupported | Not supported on this site yet | Popup |
| popup.week | {hidden} details hidden · {blocked} secrets stopped this week | Popup |
| popup.clear | Clear saved details | Button |
| popup.clearConfirm | Clear all saved details? Older replies will show placeholders. | Confirm |
| popup.footer | Everything stays on this device. | Popup footer |
| welcome.headline | MIRAGE hides your personal details from AI chatbots. | Welcome page |
| welcome.done | You're protected on ChatGPT and Gemini. | Welcome page |

Secret types for {secretType}: "an API key", "a password", "a card number", "a one-time code". In the confirm and title strings, replace ChatGPT with the current site's name.

## Honesty rules

A privacy tool lives on trust, and judges test claims, so every claim MIRAGE makes must be true of the build you actually demo.

| Claim | OK to say? | Say this instead |
|---|---|---|
| "Your real details never leave your device" | Only in local-only mode | With AWS on: "IDs and secrets never leave your device; names are checked by our AWS service, which stores nothing" |
| "MIRAGE catches all personal data" | No | "MIRAGE catches common Indian IDs, contacts and secrets, and names you add" |
| "Secrets are always blocked" | Only the types MIRAGE detects | "API keys, passwords, card numbers and one-time codes are blocked" |
| "The AI still answers perfectly" | No | "The AI still answers, because it sees placeholders instead of blanks" |
| "Compliant with DPDP" | No | "Helps small teams take a simple step toward DPDP-style care with personal data" |
| Success metrics | Only as measured | Before testing: "Our target is 95%". After: "On our 50-prompt test set, 96% were hidden" |

Always state limits in the README and when judges ask: names without the custom list, languages other than English, file uploads and sites other than ChatGPT and Gemini are not covered yet. Stating limits first makes every other claim more believable.

## README and store listing

The README is what judges and recruiters actually open, so it shows the demo in the first screen and the limits before the end.

README outline:

```
# MIRAGE: the AI privacy firewall

Hides your personal details before they reach ChatGPT or Gemini,
blocks secrets like API keys, and puts the real details back in the
reply, on your device.

![MIRAGE demo](docs/demo.gif)

## Why
One short paragraph + the Harmonic Security statistic, with source link.

## How it works
The 5 steps: type, detect, hide or block, preview, put back.
![Architecture](docs/architecture.png)

## What it protects
Table: Aadhaar, PAN, phone, email, UPI, IFSC / API keys, passwords,
card numbers, one-time codes.

## Results
Numbers from the 50-prompt test set (only once measured).

## Limits
What is not covered yet. Be specific.

## Install (developer mode)
4 steps: clone, npm install, npm run build, Load unpacked.

## Built with
WXT, TypeScript, React, Vitest (+ AWS Comprehend if used).

## Team
Team Nexora, Presidency University, Bangalore.
```

Chrome Web Store listing:

- Name: MIRAGE: AI privacy firewall
- Short description (under 132 characters): Hides your personal details and blocks secrets before you send a prompt to ChatGPT or Gemini. Real details stay on your device.
- Screenshots (1280×800): 1) highlights in the prompt box, 2) the preview panel, 3) a restored reply with the hover tooltip, 4) the block panel, 5) the popup.
- Privacy section: state plainly that no prompt text is collected or sent to MIRAGE, and that data stays in the browser (plus the AWS exception if used).

## Pitch and demo script

The winning pitch shows the product working within the first 60 seconds; slides only frame the live demo.

### 3-minute final pitch

| Time | Say | Show |
|---|---|---|
| 0:00–0:20 | "Raise your hand if you've pasted your phone number, an ID or a password into ChatGPT." Pause. "That data now sits on a server you don't control." | Title slide |
| 0:20–0:45 | "Privacy settings act after the data arrives. Company tools protect employees only. Students, patients and small offices get nothing." One statistic. | Problem slide |
| 0:45–2:00 | "Let me show you." Type the Priya prompt live; point at highlights; open preview; send; hover a restored name; paste a fake API key and show the block. | Live ChatGPT |
| 2:00–2:30 | "Everything you saw ran in the browser. The AI saw placeholders; the real details never left this laptop." Test-set results. | Architecture slide + results |
| 2:30–3:00 | Limits in one sentence, what's next, then the closing line. | Roadmap slide |

Closing line: "MIRAGE lets you use AI without handing it your identity."

Demo backup: record the live demo as a video the night before. If Wi-Fi or ChatGPT fails on stage, say "Here's the same flow recorded this morning" and play it; never apologise at length.

### 2-minute demo video (for README and submissions)

- 0:00 Title card: "MIRAGE: use AI without handing it your identity."
- 0:05 Screen: typing the Priya prompt; highlights appear live.
- 0:25 Preview panel; zoom on the placeholders; caption "This is all ChatGPT sees."
- 0:45 Reply streams in; hover a restored name; caption "Put back on your device."
- 1:05 Paste code with a fake API key; block panel; click Remove secret and send.
- 1:25 Popup: counts, safe words; caption "Nothing stored online."
- 1:40 Results and GitHub link; end card with team name.

Use only made-up data on screen, and say so in a caption: "All details shown are fictional."

## Launch posts

Post once the demo video is ready; lead with the problem people recognise, show the GIF, and credit the team.

LinkedIn (main post):

> How often do you paste your name, phone number or an ID into ChatGPT without thinking?
>
> At the AWS Innovation Challenge 2026, Team Nexora built MIRAGE: a Chrome extension that hides personal details before a prompt reaches ChatGPT or Gemini, blocks secrets like API keys, and puts the real details back in the reply, on your device.
>
> The AI still answers properly, because it sees placeholders like «PAN_1» instead of blanks.
>
> Built with WXT, TypeScript and React. Aadhaar, PAN, UPI and IFSC supported from day one.
>
> Demo + code: [GitHub link] Team: [tag teammates]

X / short post:

> Built MIRAGE: a Chrome extension that hides your personal details from ChatGPT and puts them back in the reply, on your device. Secrets like API keys never get sent. [GIF] [link]

Rules for posts: use the demo GIF, not a screenshot of code; one link only; no "revolutionary" or "game-changer"; tag teammates and the event organisers.

## Languages

Ship in English only, but write every string through a strings file from day one, so Hindi and Kannada are a translation task later, not a rewrite.

Now (English):

- Put all user-facing text in `_locales/en/messages.json`, Chrome's built-in translation format (WXT supports it).
- Chrome message names allow only letters, digits and underscores, so badge.off from the Microcopy library becomes badge_off.
- Never hard-code text in React components; always look it up by key.

Later (Hindi, then Kannada):

- Translate with a native speaker from the team or college, then check with a second person; use machine translation only as a first draft.
- Keep these untranslated: MIRAGE, ChatGPT, Gemini, placeholders like «PAN_1», and ID names people know in English (PAN, UPI, IFSC, OTP).
- Leave extra room in panels and buttons; translated text is often longer than English.
- Detection is a separate task: prompts typed in Hindi or Kannada script, and IDs written in Devanagari digits, need new rules (PRD roadmap).
- The interface language follows the user's Chrome language automatically once translations exist.

## Checklist before shipping any text

- [ ] Uses the plain word from the Word list (hide, placeholder, put back), not the code word
- [ ] No banned word (100% secure, best, WARNING, leak, Oops)
- [ ] Says what happens next, in sentence case, within the length limit
- [ ] Detections say "looks like"
- [ ] Every stop or error offers a button forward
- [ ] No real value shown in full outside the prompt box
- [ ] Every claim is true of the build being demoed (Honesty rules)
- [ ] Numbers are measured, or clearly labelled as targets
- [ ] Text lives in the strings file, not hard-coded
- [ ] Any on-screen data is fictional and labelled as such
