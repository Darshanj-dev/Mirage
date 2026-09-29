import { describe, expect, it } from 'vitest';
import { canonicalize } from './canonical';
import { detect } from './detect';

const types = (text: string) => detect(text).map((f) => [f.type, f.value]);

describe('canonicalize', () => {
  it('leaves plain ASCII alone and maps offsets 1:1', () => {
    const c = canonicalize('PAN ABCDE1234F');
    expect(c.changed).toBe(false);
    expect(c.toOriginal(4, 14)).toEqual({ start: 4, end: 14 });
  });

  it('drops zero-width characters and maps spans back to the original', () => {
    const input = 'PAN ABCDE​1234F ok';
    const c = canonicalize(input);
    expect(c.text).toBe('PAN ABCDE1234F ok');
    const span = c.toOriginal(4, 14);
    expect(input.slice(span.start, span.end)).toBe('ABCDE​1234F');
  });

  it('reads non-breaking spaces, dashes and full-width or Indian digits as ASCII', () => {
    expect(canonicalize('98450 12345').text).toBe('98450 12345');
    expect(canonicalize('5678–1234').text).toBe('5678-1234');
    expect(canonicalize('９８４').text).toBe('984');
    expect(canonicalize('९८४').text).toBe('984'); // Devanagari
  });

  it('maps astral digits (2 UTF-16 units) back correctly', () => {
    const input = 'x \u{1d7d7}\u{1d7d6} y'; // mathematical bold 9 8
    const c = canonicalize(input);
    expect(c.text).toBe('x 98 y');
    const span = c.toOriginal(2, 4);
    expect(input.slice(span.start, span.end)).toBe('\u{1d7d7}\u{1d7d6}');
  });

  it('folds Cyrillic look-alike letters', () => {
    expect(canonicalize('АВСDE1234F').text).toBe('ABCDE1234F');
  });
});

describe('detection through obfuscation', () => {
  it('finds a phone number with a non-breaking space', () => {
    expect(types('call 98450 12345')).toEqual([['PHONE', '98450 12345']]);
  });
  it('finds a PAN split by a zero-width space', () => {
    expect(types('PAN ABCDE​1234F')).toEqual([['PAN', 'ABCDE​1234F']]);
  });
  it('finds a PAN typed with Cyrillic letters', () => {
    expect(types('PAN АВСDE1234F')).toEqual([['PAN', 'АВСDE1234F']]);
  });
  it('finds an Aadhaar typed in Devanagari digits', () => {
    const devanagari = '2341 2341 2346'.replace(/\d/g, (d) => String.fromCharCode(0x966 + Number(d)));
    expect(types(`aadhaar ${devanagari}`)).toEqual([['AADHAAR', devanagari]]);
  });
});
