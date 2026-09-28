// Normalized form of a value, so the same detail typed two ways gets one placeholder
// (docs/schema.md, Matching rule).

import type { FindingType } from './types';

export function normalizeValue(type: FindingType, value: string): string {
  switch (type) {
    case 'AADHAAR':
    case 'CARD':
    case 'OTP':
      return value.replace(/\D/g, '');
    case 'PHONE':
      // +91 98450 12345, 09845012345 and 9845012345 are the same number.
      return value.replace(/\D/g, '').slice(-10);
    case 'PAN':
    case 'IFSC':
      return value.toUpperCase();
    case 'EMAIL':
    case 'UPI':
      return value.toLowerCase();
    case 'NAME':
    case 'CUSTOM':
    case 'API_KEY':
    case 'PASSWORD':
      return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }
}
