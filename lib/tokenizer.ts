// Values to «TYPE_n» placeholders (docs/schema.md, Vault and Matching rule).
// Pure functions: the service worker keeps the state inside the encrypted vault.

import { normalizeValue } from './detector/normalize';
import { KIND_LABEL, SECRET_LABEL } from './detector/taxonomy';
import type { MaskType, SecretKind, SecretType } from './detector/types';

/** Placeholder label per type. Names from rules, AWS or the Always mask list all read as PERSON. */
const LABELS: Record<MaskType, string> = {
  AADHAAR: 'AADHAAR',
  PAN: 'PAN',
  PHONE: 'PHONE',
  EMAIL: 'EMAIL',
  UPI: 'UPI',
  IFSC: 'IFSC',
  BANK_ACCOUNT: 'ACCOUNT',
  IP_ADDRESS: 'IP',
  DOB: 'DOB',
  NAME: 'PERSON',
  CUSTOM: 'PERSON',
};

/** The one place the placeholder format is defined. */
export function formatToken(label: string, n: number): string {
  return `«${label}_${n}»`;
}

/** Put in place of a secret by older builds; never restored. */
export const SECRET_REMOVED = '«SECRET_REMOVED»';

/**
 * What a removed secret becomes: a named placeholder like «AWS_SECRET_KEY_REMOVED», so the AI
 * still knows what kind of value was there. It carries no number and is never stored, so it can
 * never be put back into a reply (it does not match TOKEN_PATTERN).
 */
export function removedPlaceholder(type: SecretType, kind?: SecretKind): string {
  return `«${(kind && KIND_LABEL[kind]) || SECRET_LABEL[type]}_REMOVED»`;
}

/** Matches any numbered placeholder, e.g. «PAN_1» or «PERSON_12». */
export const TOKEN_PATTERN = /«([A-Z]+)_(\d+)»/g;

export interface VaultEntry {
  token: string; // e.g. '«PAN_1»'
  type: MaskType;
  value: string; // as the user first typed it: '98450 12345'
  normalized: string; // for matching: '9845012345'
  firstSeen: number; // Unix ms
}

export interface TokenState {
  /** Next number per placeholder label. Keyed by label, so NAME and CUSTOM share PERSON numbers. */
  counters: Partial<Record<string, number>>;
  entries: VaultEntry[];
}

export interface TokenRequest {
  type: MaskType;
  value: string;
}

export const emptyTokenState = (): TokenState => ({ counters: {}, entries: [] });

/**
 * Returns a placeholder for each requested value, reusing the existing one when the same
 * normalized value was seen before in this chat. Does not mutate `state`.
 */
export function assignTokens(
  state: TokenState,
  requests: readonly TokenRequest[],
  now: number = Date.now(),
): { state: TokenState; tokens: string[] } {
  const counters = { ...state.counters };
  const entries = [...state.entries];
  const tokens = requests.map(({ type, value }) => {
    const label = LABELS[type];
    const normalized = normalizeValue(type, value);
    const existing = entries.find((e) => LABELS[e.type] === label && e.normalized === normalized);
    if (existing) return existing.token;

    const n = (counters[label] ?? 0) + 1;
    counters[label] = n;
    const token = formatToken(label, n);
    entries.push({ token, type, value, normalized, firstSeen: now });
    return token;
  });
  return { state: { counters, entries }, tokens };
}

/** Real values for the given placeholders; unknown placeholders are left out. */
export function lookupTokens(state: TokenState, tokens: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const token of tokens) {
    const entry = state.entries.find((e) => e.token === token);
    if (entry) values[token] = entry.value;
  }
  return values;
}

export interface Replacement {
  start: number;
  end: number;
  text: string;
}

/** Replaces spans of `text`. Spans must not overlap. */
export function replaceSpans(text: string, replacements: readonly Replacement[]): string {
  const ordered = [...replacements].sort((a, b) => b.start - a.start);
  let out = text;
  for (const r of ordered) out = out.slice(0, r.start) + r.text + out.slice(r.end);
  return out;
}

/** Every distinct placeholder in `text`, in order of first appearance. */
export function findTokens(text: string): string[] {
  return [...new Set([...text.matchAll(TOKEN_PATTERN)].map((m) => m[0]))];
}
