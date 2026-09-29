// Rules that need context: the value alone is too common (a 12-digit number, a date, a
// capitalized word), so they only match next to words that say what it is.

import { digitsOnly, matchAll } from './rules';
import type { Match, Rule } from './types';

/** 9-18 digit account number right after "account no", "A/c", "acct" and similar. */
export const bankAccountRule: Rule = {
  type: 'BANK_ACCOUNT',
  policy: 'mask',
  confidence: 0.9,
  reason: 'context',
  find: (text) =>
    matchAll(
      text,
      /(?<![A-Za-z])(?:a\/c|acct|account|savings account|current account)\.?\s*(?:no\.?|number|num|#)?\s*(?:is\s*)?[:#-]?\s*(\d(?:[ -]?\d){8,17})(?![\w]|[ -]\d)/gi,
      1,
    ).filter((m) => !/^(\d)\1+$/.test(digitsOnly(m.value))),
};

const MONTH = String.raw`(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)`;
const DATE = String.raw`(?:\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}(?:st|nd|rd|th)?\s+${MONTH},?\s+\d{4}|${MONTH}\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})`;

/** A full date right after "DOB", "date of birth", "born on" or "birthday". */
export const dobRule: Rule = {
  type: 'DOB',
  policy: 'mask',
  confidence: 0.9,
  reason: 'context',
  find: (text) =>
    matchAll(
      text,
      new RegExp(
        String.raw`(?<![A-Za-z])(?:dob|d\.o\.b\.?|date\s+of\s+birth|born(?:\s+on)?|birth\s*date|birthday)\s*(?:is|was)?\s*[:=-]?\s*(${DATE})(?![\w])`,
        'gi',
      ),
      1,
    ),
};

const OCTET = String.raw`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)`;

/** IPv4 addresses. Loopback, 0.0.0.0, netmasks and version numbers are skipped. */
export const ipRule: Rule = {
  type: 'IP_ADDRESS',
  policy: 'mask',
  confidence: 0.8,
  reason: 'pattern',
  find: (text) =>
    matchAll(text, new RegExp(String.raw`(?<![\w.:-])(?:${OCTET}\.){3}${OCTET}(?![\w-]|\.\d)`, 'g')).filter((m) => {
      if (/^(?:127\.|0\.0\.0\.0$|255\.)/.test(m.value)) return false;
      const before = text.slice(Math.max(0, m.start - 12), m.start);
      return !/(?:\bv|version\s*)$/i.test(before);
    }),
};

// ---------------------------------------------------------------- names

/** Capitalized words that follow "I'm", "Dear", "Mr." and so on but are not names. */
const NOT_NAMES = new Set(
  (
    'i the a an sir madam mam maam team all everyone there friend friends customer customers hiring manager ' +
    'indian american british hindu muslim christian sikh jain buddhist catholic english hindi tamil kannada ' +
    'telugu malayalam bengali marathi gujarati punjabi urdu not very so just also still really here back sure ' +
    'sorry fine good ok okay new happy glad trying looking using working writing going getting having planning ' +
    'currently unable confused stuck interested from in at on with for to and or but your my our this that ' +
    'monday tuesday wednesday thursday friday saturday sunday january february march april may june july ' +
    'august september october november december chatgpt gemini claude copilot perplexity ai bot siri alexa ' +
    'google python java javascript react world user admin support sales hr it ceo cto doctor professor student ' +
    'teacher hod principal dean officer director applicant candidate guest members colleagues folks guys ma am'
  ).split(' '),
);

/** One to three capitalized words (Unicode letters), read at a fixed position (sticky). */
const NAME_AT = /(\p{Lu}[\p{Ll}'’-]+(?:[ \t]+\p{Lu}[\p{Ll}'’-]+){0,2})/uy; // never across a line break

interface NameTrigger {
  pattern: RegExp;
  confidence: number;
  /** Single-word names need to end a clause ("I'm Kavya, 21"), or they are too ambiguous. */
  singleNeedsStop?: boolean;
}

const NAME_TRIGGERS: readonly NameTrigger[] = [
  { pattern: /\b(?:my name is|my name's|name\s*[:-]|named)\s*/gi, confidence: 0.9 },
  { pattern: /\b(?:mr|mrs|ms|miss|dr|prof|shri|smt|sri|kumari)\.?\s+/gi, confidence: 0.85 },
  {
    pattern:
      /\b(?:my|our)\s+(?:client|customer|patient|tenant|landlord|friend|colleague|manager|boss|son|daughter|wife|husband|father|mother|dad|mom|brother|sister|student|teacher|employee|neighbou?r|uncle|aunt|cousin)\s+(?:is\s+|named\s+)?/gi,
    confidence: 0.8,
  },
  { pattern: /\b(?:i am|i'm|i’m)\s+/gi, confidence: 0.75, singleNeedsStop: true },
  { pattern: /\b(?:dear|hi|hello|hey)\s+/gi, confidence: 0.7, singleNeedsStop: true },
  { pattern: /\b(?:regards|thanks|thank you|sincerely|cheers|warmly),?\s*\n\s*/gi, confidence: 0.75 },
];

/** Names from context: "my name is Priya Nair", "Dr. Rao", "I'm Ramesh Kumar", "my client Anita Rao". */
export const nameRule: Rule = {
  type: 'NAME',
  policy: 'mask',
  confidence: 0.75,
  reason: 'context',
  find: (text) => {
    const out: Match[] = [];
    for (const trigger of NAME_TRIGGERS) {
      for (const t of text.matchAll(trigger.pattern)) {
        const at = (t.index ?? 0) + t[0].length;
        NAME_AT.lastIndex = at;
        const m = NAME_AT.exec(text);
        if (!m) continue;
        // Drop trailing words that are not names ("Priya From Bangalore" -> "Priya").
        const words = m[1]!.split(/\s+/);
        const kept: string[] = [];
        for (const w of words) {
          if (NOT_NAMES.has(w.toLowerCase().replace(/['’]/g, ''))) break;
          kept.push(w);
        }
        if (kept.length === 0 || kept[0]!.length < 2) continue;
        const value = kept.join(' ').replace(/['’-]+$/, '');
        if (trigger.singleNeedsStop && kept.length === 1) {
          const next = text.slice(at + value.length, at + value.length + 8);
          if (value.length < 3 || !/^(?:\s*[,.!?;:)]|\s*$|\s+(?:and|from|here|aged|age)\b)/.test(next)) continue;
        }
        out.push({ start: at, end: at + value.length, value, confidence: trigger.confidence });
      }
    }
    return out;
  },
};

// ---------------------------------------------------------------- health context

/**
 * Medical terms. These are kept in the prompt (the AI needs them to answer) but flagged: a lab
 * result next to a name or ID is health data about a known person, so the risk score rises and
 * the user is told why.
 */
const HEALTH_TERMS = new RegExp(
  String.raw`\b(?:HbA1c|A1c|blood sugar|fasting sugar|glucose level|cholesterol|triglycerides|blood pressure|thyroid|TSH|haemoglobin|hemoglobin|creatinine|platelets?|biopsy|diagnos(?:ed|is)|prescri(?:bed|ption)|HIV|hepatitis|tuberculosis|cancer|tumou?r|chemotherapy|diabet(?:es|ic)|hypertension|asthma|depression|anxiety disorder|bipolar|schizophrenia|pregnan(?:t|cy)|miscarriage|IVF|STD|STI|lab report|blood test|medical report|psychiatrist|antidepressants?|insulin|metformin|dialysis|epilepsy|PCOS|PCOD)\b`,
  'g',
);

export const healthRule: Rule = {
  type: 'HEALTH',
  policy: 'warn',
  confidence: 0.8,
  reason: 'pattern',
  find: (text) => {
    // Case-insensitive for words, exact case for acronyms (so "sti" in "still" never counts).
    const lower = new RegExp(HEALTH_TERMS.source.replace(/\|HIV\|/, '|').replace(/\|STD\|STI\|/, '|'), 'gi');
    const seen = new Set<number>();
    const out: Match[] = [];
    for (const m of [...matchAll(text, HEALTH_TERMS), ...matchAll(text, lower)]) {
      if (seen.has(m.start)) continue;
      seen.add(m.start);
      out.push(m);
    }
    return out.sort((a, b) => a.start - b.start);
  },
};

/**
 * Passport numbers (Indian format: one letter, 7 digits, e.g. K1234567), only next to the word
 * "passport": the shape alone is too common (order and ticket numbers).
 */
export const passportRule: Rule = {
  type: 'PASSPORT',
  policy: 'mask',
  confidence: 0.9,
  reason: 'context',
  find: (text) =>
    matchAll(text, /(?<![A-Za-z0-9])([A-PR-WYa-pr-wy][1-9]\d\s?\d{4}[1-9])(?![A-Za-z0-9])/g, 1).filter((m) =>
      /\bpassport\b[^\n]{0,25}$/i.test(text.slice(Math.max(0, m.start - 60), m.start)),
    ),
};

const ADDRESS_WORDS = String.raw`(?:road|rd|street|st|nagar|layout|cross|main|sector|colony|lane|marg|block|phase|stage|apartments?|apts?|flat|floor|house|villa|society|towers?|residency|enclave|extension|extn|avenue|ave|circle|halli|palya|puram|pet|gunta|chowk|bazaar|gali)`;
const PIN = String.raw`[1-9]\d{2}\s?\d{3}`;

/**
 * Postal addresses: text ending in a 6-digit Indian PIN code that contains street-like words
 * ("3rd Cross, Indiranagar, Bengaluru 560038"), or anything after "address:" up to a PIN code.
 */
export const addressRule: Rule = {
  type: 'ADDRESS',
  policy: 'mask',
  confidence: 0.85,
  reason: 'pattern',
  find: (text) => {
    const labelled = matchAll(
      text,
      new RegExp(String.raw`\b(?:(?:my|home|office|delivery|postal|permanent|current|billing|shipping)\s+)?address(?:\s+is)?\s*[:\-]?\s*([^\n]{6,160}?\b${PIN})(?!\d)`, 'gi'),
      1,
    ).map((m) => ({ ...m, confidence: 0.92, reason: 'context' as const }));
    const street = matchAll(
      text,
      new RegExp(String.raw`(?<![\w])(?:#\s*)?(?:\d{1,4}[A-Za-z]?(?:[/-]\d{1,4})?,?\s+)?[^\n]{0,80}?\b${ADDRESS_WORDS}\b[^\n]{0,100}?\b${PIN}(?!\d)`, 'gi'),
    )
      .map((m) => {
        // Start at the house number (or "#12"), else the first capital word — not mid-sentence.
        const lead = /(?:#\s*)?\d/.exec(m.value) ?? /\b[A-Z]/.exec(m.value);
        const cut = lead ? lead.index : 0;
        return { start: m.start + cut, end: m.end, value: m.value.slice(cut) };
      })
      // Real addresses have comma-separated parts; "the road to 560038" does not.
      .filter((m) => m.value.includes(',') && m.value.length >= 15);
    return [...labelled, ...street.filter((s) => !labelled.some((l) => s.start < l.end && l.start < s.end))];
  },
};

/** Context rules, lowest priority: an ID or secret always wins an overlap with them. */
export const CONTEXT_RULES: readonly Rule[] = [bankAccountRule, passportRule, addressRule, dobRule, ipRule, nameRule, healthRule];
