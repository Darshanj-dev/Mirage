# MIRAGE — Backend & Data Schema

Sep 28, 2026 · Ninad Pandith M N

## Overview

MIRAGE has no cloud database: every piece of data lives in the user's browser, and the optional AWS name check is stateless. The "backend" is the extension's service worker plus four browser stores.

| Store | Holds | Survives browser restart? | Personal data? |
|---|---|---|---|
| chrome.storage.local | Encrypted vault, settings, weekly counts, schema version | Yes | Only inside the encrypted vault |
| IndexedDB (extension's own) | The vault's encryption key | Yes | No |
| chrome.storage.session | Short-lived state, e.g. which tabs are paused | No, cleared when the browser closes | No |
| Content-script memory | Current findings, highlights, pending send | No, cleared on page reload | Yes, briefly, in the page only |
| AWS (optional) | Nothing stored; processes one request and forgets it | Not applicable | Names only, in memory for one request |

Why no cloud database: storing anything server-side would break the promise that real details stay on the device, add a bill and a breach risk, and give judges an easy question to attack. Counts for the demo come from the user's own browser.

This document follows the PRD, App Flow and Tech Stack. It replaces the PRD's DynamoDB line: custom rules and counts live in the browser instead.

## Storage map

Every persistent key MIRAGE writes is listed here; if code writes a key not in this table, that is a bug.

| Key | Store | Type | Encrypted | Written by |
|---|---|---|---|---|
| meta | storage.local | Meta | No | Service worker, on install and update |
| settings | storage.local | Settings | No | Service worker (from popup and page shortcuts) |
| stats | storage.local | Stats | No | Service worker |
| vault:{site}:{chatId} | storage.local | EncryptedVaultRecord | Yes (AES-GCM) | Service worker only |
| vaultIndex | storage.local | VaultIndex | No (holds no values) | Service worker only |
| alwaysMask | storage.local | EncryptedBlob | Yes (AES-GCM) | Service worker only |
| pausedTabs | storage.session | number[] (tab ids) | No | Service worker |
| mirage-keys / vaultKey | IndexedDB | CryptoKey (non-extractable) | Not applicable | Service worker, once |

The user's Always mask list usually holds their own name, so it is encrypted with the same vault key rather than kept in settings.

Key naming: lowercase, colon-separated; site is chatgpt or gemini; chatId is the conversation id from the page URL (new, unsaved chats use a temporary id until the URL changes, then the record is renamed).

## Vault

One encrypted record per chat holds the placeholder-to-value pairs; only the service worker can decrypt it.

```ts
type EntityType =
  | 'AADHAAR' | 'PAN' | 'PHONE' | 'EMAIL' | 'UPI' | 'IFSC'
  | 'NAME' | 'CUSTOM';            // secrets are never stored: they are blocked

interface VaultEntry {
  token: string;                  // e.g. '«PAN_1»'
  type: EntityType;
  value: string;                  // as the user first typed it: '98450 12345'
  normalized: string;             // for matching: '9845012345'
  firstSeen: number;              // Unix ms
}

// What is inside the encryption (never written to storage as plain text)
interface VaultRecord {
  v: 1;                           // schema version
  site: 'chatgpt' | 'gemini';
  chatId: string;
  createdAt: number;
  lastUsedAt: number;
  counters: Partial<Record<EntityType, number>>;  // next number per type
  entries: VaultEntry[];
}

// What is actually written to chrome.storage.local
interface EncryptedVaultRecord {
  v: 1;
  iv: string;                     // base64, 12 random bytes, new on every write
  ct: string;                     // base64 ciphertext of JSON.stringify(VaultRecord)
}

// Lets the 24-hour cleanup run without decrypting anything
type VaultIndex = Record<string, { lastUsedAt: number }>;  // key = storage key
```

Encryption rules:

- Algorithm: AES-GCM with a 256-bit key from crypto.subtle.generateKey, created once and marked non-extractable.
- The key is saved in IndexedDB (a CryptoKey object can be stored there but not in chrome.storage).
- Every write uses a fresh random 12-byte IV.
- The storage key string (e.g. vault:chatgpt:abc123) is passed as additional authenticated data, so a record copied under another chat's key fails to decrypt.

Matching rule: before creating a token, normalize the value (remove spaces and dashes from numbers, uppercase PAN and IFSC, lowercase email and UPI) and reuse an existing token if the normalized value is already in the record.

## Settings, stats and meta

These three records hold no personal data, so they are stored as plain JSON; the one list that could hold a name is encrypted separately.

```ts
interface Settings {
  v: 1;
  enabled: boolean;               // default true
  quickMode: boolean;             // default false
  protectedSendCount: number;     // drives the Quick mode offer after 5
  quickModeOffered: boolean;
  safeWords: string[];            // normalized; words never hidden
  awsNameCheck: boolean;          // default false; only if AWS is set up
  sites: { chatgpt: boolean; gemini: boolean };
}

// Encrypted like the vault; decrypts to { v: 1, terms: string[] }
interface EncryptedBlob { v: 1; iv: string; ct: string; }

interface Stats {
  v: 1;
  weekStart: string;              // ISO date of this week's Monday, e.g. '2026-09-28'
  week: Counts;                   // reset when weekStart changes
  lifetime: Counts;
}

interface Counts {
  hidden: number;                 // personal details replaced
  blocked: number;                // secrets stopped
  restoreFailures: number;        // placeholders the AI changed
  allowOnce: number;              // sends without hiding
  byType: Partial<Record<EntityType | 'SECRET', number>>;
}

interface Meta {
  schemaVersion: number;          // currently 1
  installedAt: number;
  onboardingDone: boolean;
  lastVaultSweepAt: number;       // last 24-hour cleanup
}
```

Defaults are written on install; any missing field is filled from defaults on read, so older records never crash newer code.

## Message types

> Not in the original .docx. Derived from docs/app-flow.md (Message contracts) and the Implementation Plan (COUNT). The source of truth in code is lib/messages.ts.

| Type | From | Request | Response |
|---|---|---|---|
| TOKENIZE | content | site, chatId, findings: {type, value}[] (mask findings only) | tokens: {value, token}[] |
| RESTORE | content | site, chatId, tokens: string[] | values: Record<token, value> (missing tokens left out) |
| GET_SETTINGS | content, popup | — | settings + alwaysMask terms |
| SET_SETTINGS | popup, content | Partial settings (+ alwaysMask terms) | saved settings |
| CLEAR_VAULT | popup | — | cleared: number of pairs |
| GET_STATS | popup | — | Stats |
| COUNT | content | Partial Counts delta (numbers only, never content) | ok |
| RENAME_CHAT | content | site, fromChatId (temporary id of a new chat), toChatId (id from the URL) | renamed: boolean |

TOKENIZE rejects any secret type: secrets are blocked, never stored. COUNT keeps only numeric fields for known types.

Every response is `{ ok: true, ... }` or `{ ok: false, error: string }`; the content script treats `ok: false` or no response as an error and blocks the send.

## Optional AWS name-check API

> Not in the original .docx. Filled in at M7 only if AWS is used.

- `POST /name-check` (API Gateway HTTP API, ap-south-1), called only by the service worker.
- Request: `{ "text": string }` — text with IDs and secrets already replaced by placeholders.
- Response: `{ "names": [{ "start": number, "end": number, "score": number }] }`.
- Lambda (Python) calls Comprehend DetectPiiEntities, keeps NAME only, logs no text, stores nothing.
- Client: `nameCheck(text)` in the service worker, 3-second timeout, returns [] on any failure or when `awsNameCheck` is off.
