// Every user-facing string comes from public/_locales/<lang>/messages.json (docs/content.md).

import { browser } from 'wxt/browser';
import type { Finding, FindingType, Reason, SecretType } from './detector/types';
import { isSecretType } from './detector/types';
import type { RiskLevel, RiskLine } from './risk';

type Messages = typeof import('../public/_locales/en/messages.json');
export type StringKey = keyof Messages;

/** The string for `key`, with $1, $2… filled from `subs`. Falls back to the key if missing. */
export function t(key: StringKey, subs: readonly (string | number)[] = []): string {
  try {
    return browser.i18n.getMessage(key, subs.map(String)) || key;
  } catch {
    return key; // extension was reloaded or turned off while this page was open
  }
}

type CountKey = 'badge_found' | 'preview_footer' | 'quick_chip' | 'popup_cleared' | 'review_title';

/** Picks the `_one` variant for a count of 1, so text reads "1 item", not "1 items". */
export function tCount(key: CountKey, n: number): string {
  return n === 1 ? t(`${key}_one`) : t(key, [n]);
}

export const secretName = (type: SecretType): string => t(`secret_${type}`);
export const typeName = (type: FindingType): string => (isSecretType(type) ? secretName(type) : t(`type_${type}`));

/** "an AWS secret key", "a password", "a PAN": the most specific name, for sentences. */
export function findingName(f: Pick<Finding, 'type' | 'kind'>): string {
  if (f.kind) return t(`kind_${f.kind}`);
  if (isSecretType(f.type)) return secretName(f.type);
  if (f.type === 'AADHAAR' || f.type === 'PAN' || f.type === 'BANK_ACCOUNT') return t(`article_${f.type}`);
  return typeName(f.type).toLowerCase();
}

/** Short label for a list row: "AWS secret key", "PAN", "Phone number". */
export function findingLabel(f: Pick<Finding, 'type' | 'kind'>): string {
  const name = f.kind || isSecretType(f.type) ? findingName(f).replace(/^(?:an?|the) /, '') : typeName(f.type);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export const levelName = (level: RiskLevel): string => t(`level_${level}`);
export const reasonText = (reason: Reason): string => t(`reason_${reason}`);

export function riskLineLabel(line: RiskLine): string {
  return line.label.startsWith('COMBO_') || line.label.startsWith('FLOOR_')
    ? t(`risk_${line.label as 'COMBO_HEALTH_IDENTITY' | 'COMBO_ID_CONTACT' | 'FLOOR_CRITICAL' | 'FLOOR_HIGH'}`)
    : typeName(line.label as FindingType);
}

/**
 * Shows a value without revealing it. Long keys keep their first 3 and last 4 characters
 * (sk-•••••7f2a) so the user can tell which one it is; anything shorter than 16 characters,
 * like a password or PAN, is hidden completely, since 7 known characters would give it away.
 */
export function obscure(value: string): string {
  if (value.length < 16) return '•'.repeat(8);
  return `${value.slice(0, 3)}•••••${value.slice(-4)}`;
}
