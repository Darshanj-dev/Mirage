// Every user-facing string comes from public/_locales/<lang>/messages.json (docs/content.md).

import { browser } from 'wxt/browser';
import type { FindingType, SecretType } from './detector/types';

type Messages = typeof import('../public/_locales/en/messages.json');
export type StringKey = keyof Messages;

/** The string for `key`, with $1, $2… filled from `subs`. Falls back to the key if missing. */
export function t(key: StringKey, subs: readonly (string | number)[] = []): string {
  return browser.i18n.getMessage(key, subs.map(String)) || key;
}

/** Picks the `_one` variant for a count of 1, so text reads "1 item", not "1 items". */
export function tCount(key: 'badge_found' | 'preview_footer' | 'quick_chip', n: number): string {
  return n === 1 ? t(`${key}_one`) : t(key, [n]);
}

export const secretName = (type: SecretType): string => t(`secret_${type}`);
export const typeName = (type: FindingType): string =>
  type === 'CARD' || type === 'API_KEY' || type === 'PASSWORD' || type === 'OTP' ? secretName(type) : t(`type_${type}`);

/** Shows a secret without revealing it: first 3 and last 4 characters, e.g. sk-•••••7f2a. */
export function obscure(value: string): string {
  if (value.length <= 8) return '•'.repeat(Math.max(value.length, 4));
  return `${value.slice(0, 3)}•••••${value.slice(-4)}`;
}
