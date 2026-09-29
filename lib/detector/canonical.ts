// Layer 0: a canonical copy of the prompt for the rules to read, with a map back to the
// original text. Text pasted from WhatsApp, PDFs or web pages often carries characters that
// look normal but break patterns: non-breaking spaces inside phone numbers, zero-width spaces
// inside IDs, full-width or Devanagari digits, Cyrillic letters that look Latin. The rules only
// ever see the canonical text; findings are mapped back so the value and its position always
// refer to what the user actually typed.

/** Removed entirely: zero-width characters, soft hyphen, word joiner, BOM. */
const DROPPED = new Set([0x00ad, 0x180e, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);

/** Read as an ordinary space. */
const SPACES = new Set([0x00a0, 0x1680, 0x2007, 0x202f, 0x205f, 0x3000]);
const isSpace = (cp: number): boolean => SPACES.has(cp) || (cp >= 0x2000 && cp <= 0x200a);

/** Read as '-': hyphens, dashes and minus signs. */
const isDash = (cp: number): boolean => (cp >= 0x2010 && cp <= 0x2015) || cp === 0x2212 || cp === 0xfe58 || cp === 0xfe63;

/** The code point of '0' in each decimal digit block MIRAGE reads (Unicode Nd). */
const DIGIT_ZEROS = [
  0x0660, // Arabic-Indic
  0x06f0, // Extended Arabic-Indic
  0x0966, // Devanagari
  0x09e6, // Bengali
  0x0a66, // Gurmukhi
  0x0ae6, // Gujarati
  0x0b66, // Oriya
  0x0be6, // Tamil
  0x0c66, // Telugu
  0x0ce6, // Kannada
  0x0d66, // Malayalam
  0xff10, // Full-width
  0x1d7ce, 0x1d7d8, 0x1d7e2, 0x1d7ec, 0x1d7f6, // Mathematical bold, double-struck, sans, sans bold, mono
];

/** Letters from other scripts that are drawn exactly like Latin letters. */
const CONFUSABLES: Record<number, string> = {};
const addConfusables = (from: string, to: string) => {
  [...from].forEach((ch, i) => (CONFUSABLES[ch.codePointAt(0)!] = to[i]!));
};
addConfusables('АВЕКМНОРСТХУаеорсухіјѕ', 'ABEKMHOPCTXYaeopcyxijs'); // Cyrillic
addConfusables('ΑΒΕΖΗΙΚΜΝΟΡΤΥΧο', 'ABEZHIKMNOPTYXo'); // Greek

function mapCodePoint(cp: number): string | null {
  if (cp < 0x80) return null; // plain ASCII: unchanged (the fast path)
  if (DROPPED.has(cp)) return '';
  if (isSpace(cp)) return ' ';
  if (isDash(cp)) return '-';
  for (const zero of DIGIT_ZEROS) if (cp >= zero && cp <= zero + 9) return String(cp - zero);
  if (cp >= 0xff01 && cp <= 0xff5e) return String.fromCharCode(cp - 0xfee0); // full-width ASCII
  return CONFUSABLES[cp] ?? null;
}

export interface Canonical {
  /** What the rules read. */
  text: string;
  /** True when anything was changed, so callers can skip the mapping work. */
  changed: boolean;
  /** Maps a [start, end) span of `text` back to the same span of the original input. */
  toOriginal(start: number, end: number): { start: number; end: number };
}

export function canonicalize(input: string): Canonical {
  // Fast path: nothing outside ASCII means nothing to change.
  if (!/[^\x00-\x7f]/.test(input)) {
    return { text: input, changed: false, toOriginal: (start, end) => ({ start, end }) };
  }

  let text = '';
  // For each UTF-16 unit of `text`: where its source character starts and ends in `input`.
  const srcStart: number[] = [];
  const srcEnd: number[] = [];
  let changed = false;

  for (let i = 0; i < input.length; ) {
    const cp = input.codePointAt(i)!;
    const width = cp > 0xffff ? 2 : 1;
    const mapped = mapCodePoint(cp);
    const out = mapped ?? input.slice(i, i + width);
    if (mapped !== null) changed = true;
    for (let k = 0; k < out.length; k++) {
      srcStart.push(i);
      srcEnd.push(i + width);
    }
    text += out;
    i += width;
  }

  return {
    text,
    changed,
    toOriginal(start, end) {
      if (start >= end) {
        const at = start < srcStart.length ? srcStart[start]! : input.length;
        return { start: at, end: at };
      }
      return { start: srcStart[start]!, end: srcEnd[end - 1]! };
    },
  };
}

/** The canonical text only (for comparing values, e.g. safe words and placeholders). */
export const canonicalText = (value: string): string => canonicalize(value).text;
