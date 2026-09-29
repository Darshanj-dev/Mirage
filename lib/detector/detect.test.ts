import { describe, expect, it } from 'vitest';
import { detect } from './detect';
import type { DetectSettings } from './types';

const brief = (text: string, settings?: DetectSettings) =>
  detect(text, settings).map(({ type, value, policy }) => ({ type, value, policy }));

describe('detect', () => {
  it('finds the demo prompt items in order, with positions', () => {
    const text = "I'm Priya Nair, PAN ABCDE1234F, phone 98450 12345. Write a leave mail to my HOD.";
    const findings = detect(text);
    expect(findings.map((f) => [f.type, f.value, f.policy])).toEqual([
      ['NAME', 'Priya Nair', 'mask'],
      ['PAN', 'ABCDE1234F', 'mask'],
      ['PHONE', '98450 12345', 'mask'],
    ]);
    for (const f of findings) expect(text.slice(f.start, f.end)).toBe(f.value);
  });

  it('returns nothing for empty or clean text', () => {
    expect(detect('')).toEqual([]);
    expect(detect('Explain photosynthesis in simple words.')).toEqual([]);
  });

  it('marks secrets as block', () => {
    expect(brief('password: tiger2026 and card 4111 1111 1111 1111')).toEqual([
      { type: 'PASSWORD', value: 'tiger2026', policy: 'block' },
      { type: 'CARD', value: '4111 1111 1111 1111', policy: 'block' },
    ]);
  });

  it('names a one-time password as OTP, not PASSWORD', () => {
    expect(brief('one-time password: 7351')).toEqual([{ type: 'OTP', value: '7351', policy: 'block' }]);
  });

  it('lets the longer finding win an overlap (UPI over the phone inside it)', () => {
    expect(brief('UPI 9845012345@ybl')).toEqual([{ type: 'UPI', value: '9845012345@ybl', policy: 'mask' }]);
  });

  it('lets a secret win over personal data it overlaps', () => {
    // A password that happens to be an email must still be blocked, not hidden.
    expect(brief('password: priya@example.com')).toEqual([
      { type: 'PASSWORD', value: 'priya@example.com', policy: 'block' },
    ]);
  });

  it('never hides a safe word', () => {
    const settings = { safeWords: ['ABCDE1234F'], alwaysMask: [] };
    expect(brief('Sample PAN ABCDE1234F, mine is BNZPM2501K', settings)).toEqual([
      { type: 'PAN', value: 'BNZPM2501K', policy: 'mask' },
    ]);
  });

  it('matches safe words after normalizing (phone typed with spaces)', () => {
    const settings = { safeWords: ['9845012345'], alwaysMask: [] };
    expect(brief('office line 98450 12345', settings)).toEqual([]);
  });

  it('does not let safe words unblock secrets', () => {
    const settings = { safeWords: ['tiger2026'], alwaysMask: [] };
    expect(brief('password: tiger2026', settings)).toHaveLength(1);
  });

  it('hides Always mask terms as whole words, any case', () => {
    const settings = { safeWords: [], alwaysMask: ['Priya Nair', 'Acme'] };
    expect(brief("I'm priya nair from ACME; Acmeville is elsewhere.", settings)).toEqual([
      { type: 'CUSTOM', value: 'priya nair', policy: 'mask' },
      { type: 'CUSTOM', value: 'ACME', policy: 'mask' },
    ]);
  });

  it('ignores blank Always mask terms and escapes regex characters', () => {
    const settings = { safeWords: [], alwaysMask: ['', '  ', 'C++ Labs'] };
    expect(brief('I work at C++ Labs.', settings)).toEqual([{ type: 'CUSTOM', value: 'C++ Labs', policy: 'mask' }]);
  });

  it('scans a 2,000-character prompt in under 200 ms', () => {
    const chunk = 'Hi, PAN ABCDE1234F, phone 98450 12345, mail a.b@example.com, code below. ';
    const text = chunk.repeat(Math.ceil(2000 / chunk.length)).slice(0, 2000);
    const t0 = performance.now();
    detect(text);
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it('scans a 20,000-character prompt without stalling', () => {
    const text = 'lorem ipsum 12345 dolor sit amet, '.repeat(600);
    const t0 = performance.now();
    detect(text);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
