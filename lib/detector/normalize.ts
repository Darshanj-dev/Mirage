// Normalized form of a value, so the same detail typed two ways gets one placeholder
// (docs/schema.md, Matching rule). Look-alike characters are folded first (canonical.ts),
// so "ABCDE​1234F" with a zero-width space matches "ABCDE1234F".

import { canonicalText } from './canonical';
import type { FindingType } from './types';

export function normalizeValue(type: FindingType, value: string): string {
  const v = canonicalText(value);
  switch (type) {
    case 'AADHAAR':
    case 'CARD':
    case 'OTP':
    case 'BANK_ACCOUNT':
      return v.replace(/\D/g, '');
    case 'PHONE':
      // +91 98450 12345, 09845012345 and 9845012345 are the same number.
      return v.replace(/\D/g, '').slice(-10);
    case 'PAN':
    case 'IFSC':
    case 'PASSPORT':
      return v.toUpperCase();
    case 'EMAIL':
      // "priya [at] example [dot] com" is priya@example.com.
      return v
        .toLowerCase()
        .replace(/\s*[[({]\s*at\s*[\])}]\s*/g, '@')
        .replace(/\s*[[({]\s*dot\s*[\])}]\s*/g, '.');
    case 'UPI':
    case 'IP_ADDRESS':
      return v.toLowerCase();
    case 'NAME':
    case 'CUSTOM':
    case 'DOB':
    case 'ADDRESS':
    case 'HEALTH':
    case 'API_KEY':
    case 'PRIVATE_KEY':
    case 'PASSWORD':
      return v.trim().replace(/\s+/g, ' ').toLowerCase();
  }
}
