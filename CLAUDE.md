Read the files in docs/ before starting any task.

# MIRAGE - rules for AI coding

MIRAGE is a Chrome extension (WXT, TypeScript strict, React) that masks personal
data in prompts on ChatGPT, Gemini, Claude, Copilot and Perplexity before sending,
removes secrets, scores privacy risk, checks AI replies, and restores real values
in replies on the device.

## Privacy rules (never break these)
- Never send raw prompt text anywhere except the chatbot, and only after masking.
- Never log prompt text, values or tokens with console.log in committed code.
- On any error, block the send and show a message. Never fail open.
- Secrets (API keys, passwords, card numbers, OTPs, private keys) are removed or blocked,
  never tokenized or stored. Their placeholders («X_REMOVED») are never restored.
- Never change the user's prompt without showing it; never change an AI reply.
- Only background.ts reads or writes the vault.

## Code rules
- TypeScript strict. No `any`.
- Logic in lib/, React UI in components/, entrypoints stay thin.
- All chatbot page selectors live in lib/sites/ only (one adapter file per site).
- Detection facts (severity, category, weight, labels) live in lib/detector/taxonomy.ts;
  the risk score is lib/risk.ts, documented in docs/detection.md. Keep them in sync.
- Message types live in lib/messages.ts only.
- Every detector rule has a .test.ts with 5+ matching and 5+ non-matching cases.
- UI injected into chatbot pages must render inside a Shadow DOM.
- No new npm packages without asking first.

## Workflow
- One small task per change. Run `npm test` before saying a task is done;
  `npm run eval` after any detector change; `npm run e2e` after any lib/sites/ change.
- If a test fails, fix the code, not the test, unless the test is wrong.

## Project notes
- The original specs are the .docx files in the project root; docs/*.md are Markdown copies.
- docs/audit-report.md and docs/detection.md (2026-09-29) are the newest docs.
- When documents disagree, the newest wins: Schema over Tech Stack over PRD for data;
  Content Guidelines for any user-facing words.
- docs/schema.md has no "Message types" or "AWS name-check API" section yet; message
  shapes come from docs/app-flow.md (Message contracts), plus a COUNT message
  (counts only, never content) for reporting stats from the content script.
