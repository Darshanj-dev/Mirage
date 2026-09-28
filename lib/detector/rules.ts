// On-device detection rules (docs/prd.md, Detection rules).
// Each rule returns raw matches; detect.ts applies overlap handling, safe words and custom terms.

import { isValidLuhn } from './luhn';
import type { Match, Rule } from './types';
import { isValidVerhoeff } from './verhoeff';

/** Collects every match of a global regex, using capture group `group` as the value when given. */
function matchAll(text: string, regex: RegExp, group = 0): Match[] {
  const out: Match[] = [];
  for (const m of text.matchAll(regex)) {
    const value = m[group];
    if (value === undefined || m.index === undefined) continue;
    const offset = group === 0 ? 0 : m[0].indexOf(value);
    const start = m.index + offset;
    out.push({ start, end: start + value.length, value });
  }
  return out;
}

const digitsOnly = (value: string): string => value.replace(/\D/g, '');

// ---------------------------------------------------------------- personal data (mask)

/** 12 digits, optionally grouped 4-4-4, never starting with 0 or 1, passing Verhoeff. */
export const aadhaarRule: Rule = {
  type: 'AADHAAR',
  policy: 'mask',
  find: (text) =>
    // Not glued to a hyphen either, so the tail of a UUID (…-426614174000) is not read as Aadhaar.
    matchAll(text, /(?<![\w-])[2-9]\d{3}([ -]?)\d{4}\1\d{4}(?![\w]|-\w)/g).filter((m) =>
      isValidVerhoeff(digitsOnly(m.value)),
    ),
};

/** 5 letters, 4 digits, 1 letter, e.g. ABCDE1234F. Uppercase only, as PANs are written. */
export const panRule: Rule = {
  type: 'PAN',
  policy: 'mask',
  find: (text) => matchAll(text, /(?<![\w])[A-Z]{5}\d{4}[A-Z](?![\w])/g),
};

/** 10 digits starting 6-9, grouped 5-5, 3-3-4 or not at all, with optional +91, 91 or 0 prefix. */
export const phoneRule: Rule = {
  type: 'PHONE',
  policy: 'mask',
  find: (text) =>
    matchAll(
      text,
      /(?<![\w+])(?:(?:\+|00)?91[ -]?|0)?(?:[6-9]\d{4}[ -]?\d{5}|[6-9]\d{2}[ -]\d{3}[ -]\d{4})(?![\w])/g,
    ),
};

/** Standard email: local part, @, domain with at least one dot. */
export const emailRule: Rule = {
  type: 'EMAIL',
  policy: 'mask',
  find: (text) =>
    matchAll(
      text,
      /(?<![\w.%+-])[A-Za-z0-9](?:[A-Za-z0-9._%+-]*[A-Za-z0-9_%+-])?@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}(?![\w-])/g,
    ),
};

/** Handles after @ that are common in code and never real UPI handles (npm tags, branches). */
const NOT_UPI_HANDLES = new Set([
  'latest', 'next', 'beta', 'alpha', 'canary', 'rc', 'stable', 'dev', 'main', 'master',
  'head', 'localhost', 'types', 'version', 'legacy', 'experimental', 'nightly', 'lts',
]);

/** name@handle with no dot after the @, which tells it apart from an email. */
export const upiRule: Rule = {
  type: 'UPI',
  policy: 'mask',
  find: (text) =>
    matchAll(
      text,
      /(?<![\w.%+-])[A-Za-z0-9][A-Za-z0-9._-]{1,255}@([A-Za-z][A-Za-z0-9]{1,63})(?![\w-])(?!\.[A-Za-z0-9])/g,
    ).filter((m) => !NOT_UPI_HANDLES.has(m.value.slice(m.value.indexOf('@') + 1).toLowerCase())),
};

/** 4 letters, a 0, then 6 letters or digits, e.g. SBIN0001234. */
export const ifscRule: Rule = {
  type: 'IFSC',
  policy: 'mask',
  find: (text) => matchAll(text, /(?<![\w])[A-Z]{4}0[A-Z0-9]{6}(?![\w])/g),
};

// ---------------------------------------------------------------- secrets (block)

/** 13-19 digits (plain, 4-4-4-4 style, or Amex 4-6-5) with a card-like first digit, passing Luhn. */
export const cardRule: Rule = {
  type: 'CARD',
  policy: 'block',
  find: (text) => {
    const patterns = [
      /(?<![\w])[2-68]\d{12,18}(?![\w])/g,
      /(?<![\w])[2-68]\d{3}([ -])\d{4}\1\d{4}\1\d{1,4}(?:\1\d{1,3})?(?![\w])/g,
      /(?<![\w])3\d{3}([ -])\d{6}\1\d{5}(?![\w])/g,
    ];
    return patterns
      .flatMap((p) => matchAll(text, p))
      .filter((m) => {
        const digits = digitsOnly(m.value);
        return digits.length >= 13 && digits.length <= 19 && isValidLuhn(digits);
      });
  },
};

/** Known key formats. Kept specific so ordinary code and hashes are not blocked. */
const KNOWN_KEY_PATTERNS: readonly RegExp[] = [
  /(?<![\w-])sk-(?:proj-|ant-|svcacct-)?[A-Za-z0-9_-]{20,}(?![\w-])/g, // OpenAI, Anthropic
  /(?<![\w])(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}(?![\w])/g, // Stripe
  /(?<![\w])(?:AKIA|ASIA)[0-9A-Z]{16}(?![\w])/g, // AWS access key id
  /(?<![\w])(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}(?![\w])/g, // GitHub tokens
  /(?<![\w])github_pat_[A-Za-z0-9_]{40,}(?![\w])/g, // GitHub fine-grained token
  /(?<![\w])AIza[0-9A-Za-z_-]{35}(?![\w-])/g, // Google API key
  /(?<![\w])xox[abprs]-[A-Za-z0-9-]{10,}(?![\w])/g, // Slack
  /(?<![\w])eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?![\w])/g, // JWT
  /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g,
];

/** Shannon entropy in bits per character. */
function entropy(value: string): number {
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/**
 * A long random-looking string: 32+ characters mixing upper case, lower case and digits,
 * with high entropy. Pure hex (hashes, UUIDs) and path-like or word-like strings are skipped.
 */
function isRandomLooking(value: string): boolean {
  if (value.length < 32) return false;
  if (/^[0-9a-fA-F-]+$/.test(value)) return false;
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/\d/.test(value)) return false;
  if ((value.match(/\d/g)?.length ?? 0) < 4) return false;
  return entropy(value) >= 4.2;
}

export const apiKeyRule: Rule = {
  type: 'API_KEY',
  policy: 'block',
  find: (text) => {
    const known = KNOWN_KEY_PATTERNS.flatMap((p) => matchAll(text, p));
    // Known formats win: a generic match overlapping a known key is dropped.
    const random = matchAll(text, /(?<![\w+/=-])[A-Za-z0-9_+/-]{32,}={0,2}(?![\w+/=-])/g).filter(
      (m) => isRandomLooking(m.value) && !known.some((k) => m.start < k.end && k.start < m.end),
    );
    return [...known, ...random];
  },
};

/** Values that are clearly not a password: placeholders, env lookups, masks. */
function isPlaceholderValue(value: string): boolean {
  return (
    /^(?:process\.env|os\.environ|env\.|import\.meta\.env|\$\{|\$[A-Z_]|<|\*{3,}|x{3,}|null|none|undefined|true|false)/i.test(
      value,
    ) || value.length < 3
  );
}

/** Looks like a chosen password: 6+ chars with a digit, a symbol, or mixed case. */
function looksLikePassword(value: string): boolean {
  if (value.length < 6) return false;
  return /\d/.test(value) || /[^A-Za-z0-9]/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value));
}

/**
 * The value after password words. With ':' or '=' any value counts ("password: abc123",
 * DB_PASSWORD="x"); with "is" the value must look like a password ("my password is Hunter@123").
 */
export const passwordRule: Rule = {
  type: 'PASSWORD',
  policy: 'block',
  find: (text) => {
    const keyword = String.raw`(?<![A-Za-z])(?:password|passwd|passphrase|passcode|pwd|pass)(?![A-Za-z])`;
    const withSeparator = new RegExp(
      keyword + String.raw`["']?\s*[:=]\s*(?:(["'\x60])([^"'\x60\s]+)\1|([^\s"'\x60,;]+))`,
      'gi',
    );
    const withIs = new RegExp(keyword + String.raw`\s+(?:is|was)\s*[:\-]?\s*(["']?)([^\s"']+)\1`, 'gi');

    const out: Match[] = [];
    for (const m of text.matchAll(withSeparator)) {
      const quoted = m[2];
      const raw = quoted ?? m[3];
      if (!raw || m.index === undefined) continue;
      // Unquoted values lose sentence punctuation: "wifi pass: Chai&Biscuit7." -> Chai&Biscuit7
      const value = quoted ?? raw.replace(/[.!?)]+$/, '');
      if (isPlaceholderValue(value)) continue;
      const start = m.index + m[0].lastIndexOf(raw);
      out.push({ start, end: start + value.length, value });
    }
    for (const m of text.matchAll(withIs)) {
      const raw = m[2];
      if (!raw || m.index === undefined) continue;
      const value = raw.replace(/[.,;!?)]+$/, '');
      if (isPlaceholderValue(value) || !looksLikePassword(value)) continue;
      const start = m.index + m[0].lastIndexOf(raw);
      out.push({ start, end: start + value.length, value });
    }
    return out;
  },
};

/**
 * 4-8 digits near the word OTP (within 30 characters either side), or right after
 * "verification code", "code is", "code:" and similar. Zip, PIN, area and error codes are skipped.
 */
export const otpRule: Rule = {
  type: 'OTP',
  policy: 'block',
  find: (text) => {
    const out: Match[] = [];
    // Stand-alone digit runs: not part of a decimal, date, or a longer grouped number like 2341 2341 2346.
    const digitRuns = matchAll(text, /(?<![\w.,/-]|\d[ -])\d{4,8}(?![\w]|[.,/-]\d|[ -]\d)/g);

    const otpWords = matchAll(
      text,
      /(?<![A-Za-z])(?:otp|one[- ]time (?:password|passcode|code|pin))(?![A-Za-z])/gi,
    );
    for (const run of digitRuns) {
      const near = otpWords.some(
        (w) => (run.start >= w.end && run.start - w.end <= 30) || (w.start >= run.end && w.start - run.end <= 30),
      );
      if (near) out.push(run);
    }

    const codeThenDigits =
      /(?<!(?:zip|pin|postal|area|error|status|country|exit|return|isd|std|hsn|sac|promo|coupon|discount|source|qr|bar|dial)[ -]?)(?<![A-Za-z])(?:(?:verification|security|confirmation|login|auth|authentication|access|sign[- ]?in|2fa|mfa)\s+)?code\s*(?:is|was|:|=|-)?\s*(\d{4,8})(?![\w]|[.,/-]\d)/gi;
    out.push(...matchAll(text, codeThenDigits, 1));
    return out;
  },
};

/** Every rule, in priority order for equal-length overlaps (OTP before password: "one-time password: 7351"). */
export const RULES: readonly Rule[] = [
  cardRule,
  apiKeyRule,
  otpRule,
  passwordRule,
  aadhaarRule,
  panRule,
  ifscRule,
  emailRule,
  upiRule,
  phoneRule,
];
