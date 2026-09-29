// On-device detection rules (docs/prd.md, Detection rules).
// Each rule returns raw matches; detect.ts applies overlap handling, safe words and custom terms.

import { isValidLuhn } from './luhn';
import type { Match, Rule, SecretKind } from './types';
import { isValidVerhoeff } from './verhoeff';

/** Collects every match of a global regex, using capture group `group` as the value when given. */
export function matchAll(text: string, regex: RegExp, group = 0): Match[] {
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

export const digitsOnly = (value: string): string => value.replace(/\D/g, '');

/** True when `pattern` occurs in the `before` characters ahead of `start` (context words). */
export function precededBy(text: string, start: number, pattern: RegExp, before = 30): boolean {
  return pattern.test(text.slice(Math.max(0, start - before), start));
}

// ---------------------------------------------------------------- personal data (mask)

/** 12 digits, optionally grouped 4-4-4, never starting with 0 or 1, passing Verhoeff. */
export const aadhaarRule: Rule = {
  type: 'AADHAAR',
  policy: 'mask',
  confidence: 0.95,
  reason: 'checksum',
  find: (text) =>
    // Not glued to a hyphen either, so the tail of a UUID (…-426614174000) is not read as Aadhaar.
    matchAll(text, /(?<![\w-])[2-9]\d{3}([ -]?)\d{4}\1\d{4}(?![\w]|-\w)/g).filter((m) =>
      isValidVerhoeff(digitsOnly(m.value)),
    ),
};

/** The 4th character of a PAN says who holds it (P person, C company, H HUF, F firm, …). */
const PAN_HOLDER = /^[A-Z]{3}[PCHFATBLJG]/;

/**
 * 5 letters, 4 digits, 1 letter, e.g. ABCDE1234F. Upper case anywhere, as PANs are written;
 * lower or mixed case only right after the word "PAN" ("my pan is abcde1234f").
 */
export const panRule: Rule = {
  type: 'PAN',
  policy: 'mask',
  confidence: 0.9,
  reason: 'pattern',
  find: (text) => [
    ...matchAll(text, /(?<![\w])[A-Z]{5}\d{4}[A-Z](?![\w])/g).map((m) => ({
      ...m,
      confidence: PAN_HOLDER.test(m.value) ? 0.92 : 0.8,
    })),
    ...matchAll(text, /(?<![\w])[A-Za-z]{5}\d{4}[A-Za-z](?![\w])/g)
      .filter((m) => m.value !== m.value.toUpperCase() && precededBy(text, m.start, /\bpan\b[^.\n]*$/i))
      .map((m) => ({ ...m, confidence: 0.85, reason: 'context' as const })),
  ],
};

/** 10 digits starting 6-9, grouped 5-5, 3-3-4 or not at all, with optional +91, 91 or 0 prefix. */
export const phoneRule: Rule = {
  type: 'PHONE',
  policy: 'mask',
  confidence: 0.85,
  reason: 'pattern',
  find: (text) => [
    ...matchAll(
      text,
      /(?<![\w+])(?:(?:\+|00)?91[ -]?|0)?(?:[6-9]\d{4}[ -]?\d{5}|[6-9]\d{2}[ -]\d{3}[ -]\d{4})(?![\w])/g,
    ),
    // Spread-out digits ("9 8 4 5 0 1 2 3 4 5", "98.450.123.45") only right after a phone word.
    ...matchAll(text, /(?<![\w+])(?:\+?91[ .-]?)?[6-9](?:[ .-]?\d){9}(?![\w]|[ .-]\d)/g)
      .filter((m) => /[ .-]\d[ .-]\d/.test(m.value) && precededBy(text, m.start, /\b(?:phone|mobile|number|call|whatsapp|contact|ph)\b[^.\n]*$/i))
      .map((m) => ({ ...m, confidence: 0.8, reason: 'context' as const })),
  ],
};

/** Standard email: local part, @, domain with at least one dot. */
export const emailRule: Rule = {
  type: 'EMAIL',
  policy: 'mask',
  confidence: 0.99,
  reason: 'pattern',
  find: (text) => [
    ...matchAll(
      text,
      /(?<![\w.%+-])[A-Za-z0-9](?:[A-Za-z0-9._%+-]*[A-Za-z0-9_%+-])?@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}(?![\w-])/g,
    ),
    // Written out to dodge filters: "priya [at] example [dot] com", "priya(at)example(dot)in".
    ...matchAll(
      text,
      /(?<![\w.])[A-Za-z0-9][A-Za-z0-9._%+-]*\s*[[({]\s*at\s*[\])}]\s*[A-Za-z0-9-]+(?:\s*[[({]\s*dot\s*[\])}]\s*[A-Za-z0-9-]+)+(?![\w])/gi,
    ).map((m) => ({ ...m, confidence: 0.85 })),
  ],
};

/** Handles after @ that are common in code and never real UPI handles (npm tags, branches). */
const NOT_UPI_HANDLES = new Set([
  'latest', 'next', 'beta', 'alpha', 'canary', 'rc', 'stable', 'dev', 'main', 'master',
  'head', 'localhost', 'types', 'version', 'legacy', 'experimental', 'nightly', 'lts',
  'server', 'host', 'github', 'gitlab', 'bitbucket', 'heroku', 'docker', 'remote', 'example',
]);

/** Handles of real UPI apps and banks: a match on one of these is almost certainly a UPI ID. */
const KNOWN_UPI_HANDLES = new Set([
  'okaxis', 'oksbi', 'okhdfcbank', 'okicici', 'ybl', 'ibl', 'axl', 'paytm', 'ptyes', 'ptaxis', 'pthdfc',
  'ptsbi', 'upi', 'apl', 'yapl', 'rapl', 'fbl', 'icici', 'sbi', 'hdfcbank', 'axisbank', 'axisb', 'kotak',
  'kmbl', 'pnb', 'boi', 'barodampay', 'unionbank', 'uboi', 'idbi', 'rbl', 'federal', 'indus', 'yesbank',
  'jio', 'airtel', 'freecharge', 'ikwik', 'waicici', 'wahdfcbank', 'wasbi', 'waaxis', 'abfspay', 'jupiteraxis',
  'sliceaxis', 'naviaxis', 'superyes', 'hsbc', 'citi', 'dbs', 'sc', 'cnrb', 'mahb', 'indianbank', 'iob',
  'ucobank', 'kvb', 'kbl', 'equitas', 'aubank', 'dlb', 'csbpay', 'timecosmos', 'pingpay', 'postbank',
]);

/** name@handle with no dot after the @, which tells it apart from an email. */
export const upiRule: Rule = {
  type: 'UPI',
  policy: 'mask',
  confidence: 0.7,
  reason: 'pattern',
  find: (text) =>
    matchAll(
      text,
      /(?<![\w.%+-])[A-Za-z0-9][A-Za-z0-9._-]{1,255}@([A-Za-z][A-Za-z0-9]{1,63})(?![\w-])(?!\.[A-Za-z0-9])/g,
    )
      .filter((m) => !NOT_UPI_HANDLES.has(m.value.slice(m.value.indexOf('@') + 1).toLowerCase()))
      .map((m) =>
        KNOWN_UPI_HANDLES.has(m.value.slice(m.value.indexOf('@') + 1).toLowerCase()) ? { ...m, confidence: 0.95 } : m,
      ),
};

/** 4 letters, a 0, then 6 letters or digits, e.g. SBIN0001234. */
export const ifscRule: Rule = {
  type: 'IFSC',
  policy: 'mask',
  confidence: 0.85,
  reason: 'pattern',
  find: (text) => matchAll(text, /(?<![\w])[A-Z]{4}0[A-Z0-9]{6}(?![\w])/g),
};

// ---------------------------------------------------------------- secrets (block)

/** 13-19 digits (plain, 4-4-4-4 style, or Amex 4-6-5) with a card-like first digit, passing Luhn. */
export const cardRule: Rule = {
  type: 'CARD',
  policy: 'block',
  confidence: 0.95,
  reason: 'checksum',
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
        // A bank account number labelled as one is not a card, even if it happens to pass Luhn.
        if (precededBy(text, m.start, /\b(?:a\/c|acct|account)\b[^.\n]{0,20}$/i)) return false;
        return digits.length >= 13 && digits.length <= 19 && isValidLuhn(digits);
      });
  },
};

/** Known key formats. Kept specific so ordinary code and hashes are not blocked. */
const KNOWN_KEY_PATTERNS: readonly (readonly [RegExp, SecretKind, number?])[] = [
  [/(?<![\w-])sk-ant-[A-Za-z0-9_-]{20,}(?![\w-])/g, 'anthropic'],
  [/(?<![\w-])sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}(?![\w-])/g, 'openai'],
  [/(?<![\w])(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}(?![\w])/g, 'stripe'],
  [/(?<![\w])(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}(?![\w])/g, 'aws_access_key'],
  [/(?<![\w])(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}(?![\w])/g, 'github'],
  [/(?<![\w])github_pat_[A-Za-z0-9_]{40,}(?![\w])/g, 'github'],
  [/(?<![\w])glpat-[A-Za-z0-9_-]{20,}(?![\w-])/g, 'gitlab'],
  [/(?<![\w])AIza[0-9A-Za-z_-]{35}(?![\w-])/g, 'google'],
  [/(?<![\w])GOCSPX-[A-Za-z0-9_-]{24,}(?![\w-])/g, 'google_oauth'],
  [/(?<![\w])xox[abprse]-[A-Za-z0-9-]{10,}(?![\w])/g, 'slack'],
  [/(?<![\w])xapp-\d-[A-Za-z0-9-]{10,}(?![\w])/g, 'slack'],
  [/https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]{12,}/g, 'webhook'],
  [/https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{20,}/g, 'webhook'],
  [/(?<![\w])npm_[A-Za-z0-9]{36}(?![\w])/g, 'npm'],
  [/(?<![\w])hf_[A-Za-z0-9]{30,}(?![\w])/g, 'huggingface'],
  [/(?<![\w])SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{30,}(?![\w-])/g, 'sendgrid'],
  [/(?<![\w])SK[0-9a-f]{32}(?![\w])/g, 'twilio'],
  [/(?<![\w:])\d{8,10}:AA[A-Za-z0-9_-]{33}(?![\w-])/g, 'telegram'],
  [/(?<![\w])eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?![\w])/g, 'jwt'],
];

/** An AWS secret access key: 40 base64 characters, named as one nearby. */
const AWS_SECRET = /(?<![A-Za-z0-9/+])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=])/g;
const AWS_SECRET_CONTEXT = /(?:aws_?secret|secret_?access_?key|secretaccesskey|aws.{0,20}secret|secret key)[^\n]{0,20}$/i;

/** "Authorization: Bearer <token>" and friends. */
const BEARER = /\b(?:Bearer|Token|Basic)\s+([A-Za-z0-9._~+/-]{20,}=*)(?![\w])/g;

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
  confidence: 0.98,
  reason: 'knownFormat',
  find: (text) => {
    const known: Match[] = KNOWN_KEY_PATTERNS.flatMap(([p, kind]) => matchAll(text, p).map((m) => ({ ...m, kind })));
    // AWS secret keys have no prefix: they count when named, or when an AWS key id is in the same prompt.
    const hasAwsKeyId = known.some((k) => k.kind === 'aws_access_key');
    for (const m of matchAll(text, AWS_SECRET)) {
      const named = precededBy(text, m.start, AWS_SECRET_CONTEXT, 60);
      if ((named || hasAwsKeyId) && /[A-Z]/.test(m.value) && /[a-z]/.test(m.value) && /\d|[/+]/.test(m.value)) {
        known.push({ ...m, kind: 'aws_secret_key', confidence: named ? 0.97 : 0.9, reason: 'context' });
      }
    }
    for (const m of matchAll(text, BEARER, 1)) {
      if (!known.some((k) => m.start < k.end && k.start < m.end)) {
        known.push({ ...m, kind: 'bearer', confidence: 0.9, reason: 'context' });
      }
    }
    // Known formats win: a generic match overlapping a known key is dropped.
    const random = matchAll(text, /(?<![\w+/=-])[A-Za-z0-9_+/-]{32,}={0,2}(?![\w+/=-])/g)
      .filter((m) => isRandomLooking(m.value) && !known.some((k) => m.start < k.end && k.start < m.end))
      .map((m) => ({ ...m, kind: 'high_entropy' as const, confidence: 0.7, reason: 'entropy' as const }));
    return [...known, ...random];
  },
};

/** PEM and OpenSSH private keys, PGP private key blocks; also a pasted key missing its END line. */
export const privateKeyRule: Rule = {
  type: 'PRIVATE_KEY',
  policy: 'block',
  confidence: 0.99,
  reason: 'knownFormat',
  find: (text) => {
    const begin = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g;
    const out: Match[] = [];
    for (const m of text.matchAll(begin)) {
      const start = m.index ?? 0;
      const rest = text.slice(start);
      const end = /-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/.exec(rest);
      // Without an END line: the header plus the base64 lines that follow it.
      const length = end ? end.index + end[0].length : (/^-----BEGIN[^\n]*(?:\n[A-Za-z0-9+/=:\- ]*)*/.exec(rest)?.[0].length ?? m[0].length);
      out.push({ start, end: start + length, value: text.slice(start, start + length).trimEnd() });
    }
    return out.map((m) => ({ ...m, end: m.start + m.value.length }));
  },
};

/** Literal passwords that are documentation, not secrets: postgres://user:password@localhost. */
const DOC_PASSWORDS = new Set(['password', 'pass', 'passwd', 'pwd', 'secret', 'changeme', 'yourpassword', 'mypassword']);

/**
 * The password inside a URL or connection string: postgres://admin:S3cret@db:5432/app.
 * Only the password is taken, so the AI still sees the user, host and database it may need.
 */
export const connectionStringRule: Rule = {
  type: 'PASSWORD',
  policy: 'block',
  confidence: 0.95,
  reason: 'pattern',
  find: (text) => {
    const url = /\b([a-z][a-z0-9+.-]{1,20}):\/\/[^\s:/@'"`]+:([^\s/@'"`]+)@[\w.-]/gi;
    const out: Match[] = [];
    for (const m of text.matchAll(url)) {
      const scheme = m[1]!.toLowerCase();
      const password = m[2]!;
      if (m.index === undefined || isPlaceholderValue(password) || DOC_PASSWORDS.has(password.toLowerCase())) continue;
      const start = m.index + m[0].lastIndexOf(`:${password}@`) + 1;
      const kind: SecretKind = /^(?:https?|ftps?|sftp|ssh|ws|wss)$/.test(scheme) ? 'url_credentials' : 'connection_string';
      out.push({ start, end: start + password.length, value: password, kind });
    }
    return out;
  },
};

/** Names that say "this value is a secret" when something is assigned to them. */
const SECRET_NAME = String.raw`(?:api[_-]?key|apikey|x-api-key|secret(?:[_-]?key)?|client[_-]?secret|app[_-]?secret|access[_-]?token|auth[_-]?token|refresh[_-]?token|id[_-]?token|bearer[_-]?token|token|private[_-]?key|secret[_-]?access[_-]?key|access[_-]?key|account[_-]?key|signing[_-]?key|encryption[_-]?key|master[_-]?key|webhook[_-]?secret|session[_-]?(?:key|secret|token)|credentials?)`;

/** A value that looks like a real secret, not a variable, placeholder or ordinary word. */
function looksLikeSecretValue(value: string): boolean {
  if (value.length < 8 || isPlaceholderValue(value)) return false;
  if (/your|here|example|sample|dummy|changeme|redacted|xxxx|\.\.\./i.test(value)) return false;
  // A code path like config.auth.token (no digits in any part), not a token like ya29.a0Af…
  if (/^[A-Za-z_$][A-Za-z_$]*(?:\.[A-Za-z_$][A-Za-z_$]*)+$/.test(value)) return false;
  if (/^[A-Z][A-Z0-9_]+$/.test(value)) return false; // another constant's name
  if (/[()]/.test(value)) return false; // a call, not a value
  if (/^[a-z]+(?:[-_ ][a-z]+)*$/.test(value)) return false; // plain words
  return /\d/.test(value) || /[^A-Za-z0-9]/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value));
}

/**
 * A value assigned to a secret-looking name in code, .env files, JSON, YAML or query strings:
 * STRIPE_SECRET=…, "client_secret": "…", apiKey: '…', ?api_key=… . Password names are the
 * PASSWORD rule's job.
 */
export const secretAssignmentRule: Rule = {
  type: 'API_KEY',
  policy: 'block',
  confidence: 0.88,
  reason: 'assignment',
  find: (text) => {
    const assignment = new RegExp(
      String.raw`(?<![A-Za-z0-9])[A-Za-z0-9_.-]*?` +
        SECRET_NAME +
        String.raw`(?![A-Za-z0-9_])["']?\s*(?::=|=|:)\s*(?:(["'\x60])([^"'\x60\n]+?)\1|([^\s"'\x60,;&<>]+))`,
      'gi',
    );
    const out: Match[] = [];
    for (const m of text.matchAll(assignment)) {
      const raw = m[2] ?? m[3];
      if (!raw || m.index === undefined) continue;
      const value = m[2] ?? raw.replace(/[.,)\]}]+$/, '');
      if (!looksLikeSecretValue(value)) continue;
      const start = m.index + m[0].lastIndexOf(raw);
      out.push({ start, end: start + value.length, value, kind: 'env_secret' });
    }
    return out;
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
  confidence: 0.9,
  reason: 'context',
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
    // "with password S3rv3r#Pass": no ':' or 'is', so only a strong-looking value counts
    // (8+ characters with a digit and a symbol), never "password Manager2".
    const bare = new RegExp(keyword + String.raw`\s+(["']?)([^\s"']{8,})\1`, 'gi');
    for (const m of text.matchAll(bare)) {
      const raw = m[2];
      if (!raw || m.index === undefined) continue;
      const value = raw.replace(/[.,;!?)]+$/, '');
      const strong = /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
      if (!strong || isPlaceholderValue(value) || out.some((o) => o.start <= m.index! + m[0].length && m.index! <= o.end)) continue;
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
  confidence: 0.9,
  reason: 'context',
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

/** The ID, contact and secret rules, in priority order for equal-length overlaps (OTP before password: "one-time password: 7351"). */
export const PATTERN_RULES: readonly Rule[] = [
  cardRule,
  privateKeyRule,
  apiKeyRule,
  connectionStringRule,
  secretAssignmentRule,
  otpRule,
  passwordRule,
  aadhaarRule,
  panRule,
  ifscRule,
  emailRule,
  upiRule,
  phoneRule,
];
