// MIRAGE Core public API: the one entry point every surface uses outside the browser
// (the macOS desktop companion runs this file inside JavaScriptCore). Pure: no browser,
// Node or network APIs. The extension imports the same modules directly.

import { canonicalText } from '../detector/canonical';
import { detect } from '../detector/detect';
import { CATEGORY, SEVERITY } from '../detector/taxonomy';
import { isMaskType, isSecretType, type DetectSettings, type Finding, type MaskType, type Severity } from '../detector/types';
import { assessRisk, type Risk } from '../risk';
import { TOKEN_PATTERN, assignTokens, emptyTokenState, lookupTokens, removedPlaceholder, replaceSpans, type TokenState } from '../tokenizer';

export const CORE_VERSION = '1.0.0';

/** What MIRAGE recommends per severity (the desktop policy screen edits this). */
export type PolicyAction = 'warn' | 'recommendMask' | 'protect' | 'confirm';
export type Policy = Record<Severity, PolicyAction>;
export const DEFAULT_POLICY: Policy = { low: 'warn', medium: 'recommendMask', high: 'protect', critical: 'confirm' };

export interface Analysis {
  findings: (Finding & { redacted: string })[];
  risk: Risk;
  /** The strictest action any finding calls for. null when nothing actionable was found. */
  action: PolicyAction | null;
}

const RANK: Record<PolicyAction, number> = { warn: 0, recommendMask: 1, protect: 2, confirm: 3 };

/**
 * A value shown so the user can recognise it without it being revealed:
 * ████████1234 for IDs, keys and numbers; d*******@gmail.com for email.
 */
export function redact(f: Pick<Finding, 'type' | 'value'>): string {
  const v = canonicalText(f.value).replace(/\s+/g, '');
  if (f.type === 'EMAIL' && v.includes('@')) {
    const [user, domain] = [v.slice(0, v.indexOf('@')), v.slice(v.indexOf('@') + 1)];
    return `${user.charAt(0)}${'*'.repeat(Math.max(3, Math.min(8, user.length - 1)))}@${domain}`;
  }
  if (f.type === 'NAME' || f.type === 'CUSTOM' || f.type === 'HEALTH') return `${v.charAt(0)}${'*'.repeat(Math.min(8, Math.max(3, v.length - 1)))}`;
  if (f.type === 'PASSWORD' || f.type === 'OTP' || v.length < 8) return '█'.repeat(8);
  const tail = v.length >= 12 ? 4 : 2;
  return '█'.repeat(Math.min(12, v.length - tail)) + v.slice(-tail);
}

export function analyze(text: string, settings: DetectSettings, policy: Policy = DEFAULT_POLICY): Analysis {
  const findings = detect(text, settings);
  let action: PolicyAction | null = null;
  for (const f of findings) {
    if (f.policy === 'warn') continue;
    const a = policy[f.severity];
    if (action === null || RANK[a] > RANK[action]) action = a;
  }
  return { findings: findings.map((f) => ({ ...f, redacted: redact(f) })), risk: assessRisk(findings), action };
}

export interface Protection {
  text: string;
  state: TokenState;
  hidden: number;
  removed: number;
}

/**
 * The protected prompt: personal data behind numbered placeholders («PAN_1»), secrets replaced
 * by named unnumbered ones («AWS_SECRET_KEY_REMOVED») that are never stored. `keep` lists
 * finding indexes the user chose to send as typed.
 */
export function protect(text: string, settings: DetectSettings, state?: TokenState | null, keep: readonly number[] = []): Protection {
  state ??= emptyTokenState(); // callers outside JS pass null for "no session yet"
  const findings = detect(text, settings);
  const kept = new Set(keep);
  const hide = findings.map((f, i) => ({ f, i })).filter(({ f, i }) => isMaskType(f.type) && !kept.has(i));
  const { state: next, tokens } = assignTokens(state, hide.map(({ f }) => ({ type: f.type as MaskType, value: f.value })));
  const replacements: { start: number; end: number; text: string }[] = [];
  let removed = 0;
  findings.forEach((f, i) => {
    if (kept.has(i)) return;
    if (isSecretType(f.type)) {
      removed++;
      replacements.push({ start: f.start, end: f.end, text: removedPlaceholder(f.type, f.kind) });
      return;
    }
    const h = hide.findIndex((x) => x.i === i);
    if (h >= 0) replacements.push({ start: f.start, end: f.end, text: tokens[h]! });
  });
  return { text: replaceSpans(text, replacements), state: next, hidden: hide.length, removed };
}

/**
 * What each finding would be sent as right now (same numbering as protect() would give), for
 * hover tooltips. Warnings (kept) get null. Saves nothing.
 */
export function previewPlaceholders(text: string, settings: DetectSettings, state?: TokenState | null): (string | null)[] {
  const findings = detect(text, settings);
  const masks = findings.map((f, i) => ({ f, i })).filter(({ f }) => isMaskType(f.type));
  const { tokens } = assignTokens(state ?? emptyTokenState(), masks.map(({ f }) => ({ type: f.type as MaskType, value: f.value })));
  return findings.map((f, i) => {
    if (isSecretType(f.type)) return removedPlaceholder(f.type, f.kind);
    const m = masks.findIndex((x) => x.i === i);
    return m >= 0 ? tokens[m]! : null;
  });
}

/** Puts real values back for known placeholders; secrets were never stored and stay removed. */
export function restore(text: string, state: TokenState): { text: string; restored: number } {
  const values = lookupTokens(state, [...new Set([...text.matchAll(TOKEN_PATTERN)].map((m) => m[0]))]);
  let restored = 0;
  const out = text.replace(TOKEN_PATTERN, (t) => {
    const v = values[t];
    if (v === undefined) return t;
    restored++;
    return v;
  });
  return { text: out, restored };
}

/** Reply check: secrets and high-severity IDs only, never values the user's own map restored. */
export function checkReply(text: string, settings: DetectSettings, known: readonly string[] = []): Analysis {
  const knownSet = new Set(known.map((k) => canonicalText(k).replace(/[\s-]/g, '').toUpperCase()));
  const a = analyze(text, settings);
  const findings = a.findings.filter(
    (f) => (f.severity === 'critical' || f.severity === 'high') && !knownSet.has(canonicalText(f.value).replace(/[\s-]/g, '').toUpperCase()),
  );
  return { findings, risk: assessRisk(findings), action: findings.length ? 'warn' : null };
}

export { CATEGORY, SEVERITY, emptyTokenState };
