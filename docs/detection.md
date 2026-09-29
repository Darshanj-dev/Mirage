# MIRAGE — Detection and risk score

How MIRAGE decides what is sensitive, how sure it is, and how the risk score is calculated. Everything here runs in the browser; nothing is sent anywhere to be checked.

## Layers

| Layer | File | What it does |
|---|---|---|
| 0 Canonical text | `lib/detector/canonical.ts` | Removes zero-width characters and soft hyphens; reads non-breaking spaces as spaces, Unicode dashes as `-`, full-width and Indian-script digits (Devanagari, Kannada, Tamil…) as ASCII, Cyrillic/Greek look-alike letters as Latin. Keeps a map back to the original text, so every finding points at exactly what the user typed. |
| 1 Patterns + checksums | `lib/detector/rules.ts` | Aadhaar (Verhoeff), PAN (holder-type letter), cards (Luhn), phone, email (also `name [at] domain [dot] com`), UPI (known bank handles), IFSC, 20+ published key formats, private keys, passwords, OTPs, connection-string passwords, secrets assigned to secret-looking names. |
| 2 Entropy | `rules.ts` (`isRandomLooking`) | 32+ character strings with mixed case, digits and ≥ 4.2 bits/char entropy. Hex hashes and UUIDs are skipped. |
| 3 Context | `context.ts`, `contextRules.ts` | Confidence up when a nearby word names the value ("phone", "PAN", "card"), down near "example"/"sample" and for masked-looking values (`XXXXX1234X`). Names, dates of birth, bank accounts and health terms only match with context ("my name is", "DOB", "account no"). |
| 4 Classification | `taxonomy.ts` | Severity, category, risk weight and placeholder label per type. |
| 5 Risk | `lib/risk.ts` | One score for the prompt, with every point explained. |

Every finding carries: `type`, `start/end` (location), `confidence` (0–1), `severity`, `category`, `reason`, `policy` (recommended action) and, for secrets, `kind` (e.g. `aws_secret_key`).

## Actions

| Policy | Types | What happens |
|---|---|---|
| `block` (remove) | API keys and tokens, private keys, passwords, cards, OTPs | Replaced by a named, unnumbered placeholder like `«AWS_SECRET_KEY_REMOVED»`. Never stored, never put back. "Send anyway" needs a second confirm and is off while *Block secrets* is on. |
| `mask` (hide) | Aadhaar, PAN, phone, email, UPI, IFSC, bank account, IP, date of birth, names, Always-hide terms | Replaced by a reversible placeholder like `«PAN_1»`; the real value is kept in the encrypted vault for 24 hours so the reply can show it. |
| `warn` (keep) | Health terms | Kept (the AI needs "HbA1c 7.9" to answer) but counted in the risk score. |

Placeholders use `« »` rather than `<PAN_001>`: chat sites render replies as Markdown/HTML, and `<…>` is often dropped as an unknown tag. `«»` survives the round trip on ChatGPT, Gemini and Perplexity (checked live).

## Severity

| Severity | Types | Why |
|---|---|---|
| critical | API_KEY, PRIVATE_KEY, PASSWORD, CARD, OTP | Grants access to an account or money on its own. |
| high | AADHAAR, PAN, BANK_ACCOUNT | Government or bank identifier: enables fraud and KYC abuse. |
| medium | PHONE, UPI, NAME, CUSTOM, DOB, HEALTH | Identifies or reaches a person. |
| low | EMAIL, IFSC, IP_ADDRESS | Useful to an attacker only in combination. |

## Risk score (0–100)

1. **Items.** Each distinct detail adds `weight × confidence`. A second, third… detail of the same type adds half its weight. The same value typed twice counts once.

   | Weight | Types |
   |---|---|
   | 60 | API key, private key |
   | 55 | password, card |
   | 50 | OTP |
   | 35 | Aadhaar |
   | 30 | PAN, bank account |
   | 15 | date of birth, UPI |
   | 12 | phone, name, Always-hide term |
   | 10 | email, health detail |
   | 8 | IP address |
   | 5 | IFSC |

2. **Combinations.** Health detail + anything identifying the person: **+15** ("Health detail tied to you"). Aadhaar/PAN + phone/email: **+10** ("ID together with contact details").
3. **Floor.** The worst single item sets a minimum: any critical item → at least 71 (critical); any high item → at least 41 (high). One Aadhaar number alone is never "low risk".
4. **Cap** at 100 (the largest line is reduced so the explanation still adds up).

| Level | Score |
|---|---|
| Safe | 0 (nothing found) |
| Low | 1–40 |
| High | 41–70 |
| Critical | 71–100 |

The review panel's **Review → Why N?** line shows exactly these lines, e.g. `PAN +28 · Phone number +12 · Email +10 · ID together with contact details +10`.

## Results

`npm run eval` scores the detector on `test-prompts/corpus.ts` (181 fictional prompts). Numbers from 2026-09-29 (`docs/eval-results.json`):

| Group | Prompts | Items | Recall | Precision | F1 |
|---|---|---|---|---|---|
| Personal data | 50 | 119 | 0.992 | 1.000 | 0.996 |
| Secrets | 50 | 51 | 1.000 | 1.000 | 1.000 |
| Clean look-alikes | 28 | 0 | — | 1.000 | — |
| Adversarial | 26 | 30 | 1.000 | 1.000 | 1.000 |
| Obfuscated | 27 | 27 | 1.000 | 1.000 | 1.000 |

Overall precision 1.000, recall 0.996, F1 0.998; false-positive rate on clean prompts 0/28. Latency: 0.05 ms mean per corpus prompt, 1.8 ms for 2,000 characters, 8 ms for 20,000.

**Read these numbers honestly.** The corpus was written by the same people as the rules, so it measures "does MIRAGE do what we designed" more than real-world accuracy. The one miss (`name Arjun Menon` with no colon) is a real gap. A blind test set written by someone else is the next step.
