# MIRAGE roadmap

From an external review (September 2026), ordered in the phases the reviewer asked for. Status reflects what is actually built and tested today, not what is planned.

**Legend:** ✅ Done · 🟡 Partly done · ⬜ To do

## Phase 1 — Live verification

| # | Item | Status | Notes |
|---|---|---|---|
| 1.1 | Test Claude and Microsoft Copilot (extension) with signed-in accounts and synthetic data | ⬜ | Both need sign-in; adapters are marked **beta** until then. |
| 1.2 | Confirm raw values never appear in outgoing requests | 🟡 | Automated (`npm run e2e`) on ChatGPT, Gemini, Perplexity: 0 raw values in all requests. Claude/Copilot pending. |
| 1.3 | Test Enter, send button, edited messages, new/existing chats, streaming replies | 🟡 | Enter + send button tested live. Edited messages have a guard and unit tests; not yet live-tested. |
| 1.4 | Gemini: block panel and refresh persistence | ⬜ | |
| 1.5 | Label every platform Tested / Beta / Unsupported | ✅ | Extension popup and settings; desktop `SUPPORTED_APPS.md`. |

## Phase 2 — Private compose and restoration security

| # | Item | Status | Notes |
|---|---|---|---|
| 2.1 | Private Compose: write in an extension-owned side panel, scan, insert only the protected text | ⬜ | Today's interception mode lets the website read what is typed in its own box before MIRAGE acts (documented limit). |
| 2.2 | Hover-only restoration by default | 🟡 | The setting exists ("Show real details in replies"). Default is still inline. |
| 2.3 | Explain Quick mode, inline restoration and Send anyway | 🟡 | Settings hints exist; needs a clearer explanation page. |

## Phase 3 — Permissions and independent evaluation

| # | Item | Status | Notes |
|---|---|---|---|
| 3.1 | Optional per-site host permissions with Connect / Disconnect | ⬜ | Today: 5 fixed hosts, no other sites. |
| 3.2 | Blind evaluation set by someone who didn't write the rules | ⬜ | Current eval (`npm run eval`) is written by the rule authors: P 1.00 / R 0.996 is a floor check, not proof. |
| 3.3 | Publish misses and false positives with precision/recall | 🟡 | Published for the internal set in `docs/eval-results.json`. |

## Phase 4 — Files and more detection

| # | Item | Status | Notes |
|---|---|---|---|
| 4.1 | Street and postal addresses | ⬜ | |
| 4.2 | Names without a lead-in phrase | ⬜ | Today: context phrases or the Always-hide list. |
| 4.3 | Passport and institutional IDs | ⬜ | |
| 4.4 | Lowercase PAN, unusual formatting | 🟡 | Lowercase PAN after the word "PAN"; Unicode look-alikes, zero-width and Indian digits handled. |
| 4.5 | Secrets split across lines | ⬜ | |
| 4.6 | More Indian languages | ⬜ | Indian-script digits are read; words are not. |
| 4.7 | Local file scanning (.txt, .csv, .json, .env, source code; PDF later) | ⬜ | Scan in the browser before upload; never upload to MIRAGE. |

## Engineering

| # | Item | Status | Notes |
|---|---|---|---|
| 5.1 | CI on every commit: tests, typecheck, build, dependency audit | ✅ | `.github/workflows/ci.yml` (extension + macOS Swift tests). |
| 5.2 | Scheduled live compatibility checks; selector failure visible | 🟡 | Local `npm run e2e`; the extension already shows "can't protect this page" when the composer vanishes. Scheduled CI run to do. |
| 5.3 | "Copy with details" for Gemini and others | ⬜ | ChatGPT only. |
| 5.4 | Redesign the welcome page | ⬜ | |
| 5.5 | Update `docs/schema.md` and `docs/app-flow.md` | ⬜ | Newest docs: `docs/audit-report.md`, `docs/detection.md`. |
| 5.6 | Show last successful compatibility date per platform | 🟡 | In `lib/sites/*` (`verifiedOn`); not yet shown in the UI. |
| 5.7 | Fix duplicated `Panel` import warning | ✅ | |
| 5.8 | Split `useSendFlow` and `MirageApp` into smaller modules | ⬜ | |
| 5.9 | Reduce the ~220 KB React runtime in the content script | ⬜ | |
| 5.10 | Tests for service-worker restarts and background tabs | 🟡 | Background-tab stall fixed and covered; SW restart test to do. |

## Distribution

| Item | Status |
|---|---|
| Windows installer for Chrome/Edge (built in CI) | ✅ `MIRAGE-Chrome-Setup-*.exe` on the Releases page |
| Chrome Web Store / Edge Add-ons listing (removes the "Load unpacked" step) | ⬜ |
| macOS desktop app: notarized Developer ID build + DMG | ⬜ (builds from source today) |
| Windows desktop companion (UI Automation) | ⬜ |
