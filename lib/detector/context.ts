// Layer 3: context scoring. A rule's confidence goes up when a word nearby says what the value
// is ("phone 98450 12345") and down when the text says it is an example ("sample PAN").
// Personal details below MIN_CONFIDENCE are dropped; secrets are never dropped by context,
// because a missed secret costs far more than an extra question.

import type { FindingType } from './types';

export const MIN_CONFIDENCE = 0.5;

const BEFORE = 40;
const AFTER = 20;

/** Words that confirm what a value is. */
const CONFIRMS: Partial<Record<FindingType, RegExp>> = {
  PHONE: /\b(phone|mobile|mob|cell|call|contact|whatsapp|number|ph)\b/i,
  EMAIL: /\b(e-?mail|mail|contact)\b/i,
  AADHAAR: /\b(aadhaar|aadhar|adhar|uid|uidai)\b/i,
  PAN: /\b(pan)\b/i,
  UPI: /\b(upi|vpa|gpay|google pay|phonepe|paytm|bhim|pay)\b/i,
  IFSC: /\b(ifsc)\b/i,
  IP_ADDRESS: /\b(ip|server|host|ssh|vpn|address)\b/i,
  CARD: /\b(card|credit|debit|visa|mastercard|rupay|amex|cvv)\b/i,
  API_KEY: /\b(key|token|secret|api|auth|bearer|credential)\b/i,
};

/** Words that say the value is not real. */
const EXAMPLE_WORDS = /\b(example|sample|dummy|fake|placeholder|lorem|e\.g\.)\b/i;

/** Values that are masked already or obviously made up: XXXXX1234X, ••••, 00000 00000. */
const PLACEHOLDER_VALUE = /[Xx*•]{3,}|(\d)\1{7,}/;

export interface Scored {
  confidence: number;
  /** The word that raised confidence, shown in the explanation ("near the word “phone”"). */
  context?: string;
  /** True when the text around it looks like an example. */
  example: boolean;
}

export function scoreContext(text: string, type: FindingType, start: number, end: number, base: number, value: string): Scored {
  const around = text.slice(Math.max(0, start - BEFORE), start) + ' ' + text.slice(end, end + AFTER);
  let confidence = base;
  let context: string | undefined;

  const confirm = CONFIRMS[type]?.exec(around);
  if (confirm) {
    confidence = Math.min(0.99, confidence + 0.05);
    context = confirm[1]!.toLowerCase();
  }

  const example = EXAMPLE_WORDS.test(around) || /EXAMPLE/i.test(value);
  if (example) confidence -= type === 'NAME' ? 0.35 : 0.25;
  if (PLACEHOLDER_VALUE.test(value)) confidence -= 0.5;

  return { confidence: Math.max(0.05, Math.round(confidence * 100) / 100), context, example };
}
