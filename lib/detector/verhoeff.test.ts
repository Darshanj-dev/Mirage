import { describe, expect, it } from 'vitest';
import { isValidVerhoeff, verhoeffCheckDigit } from './verhoeff';

describe('verhoeff', () => {
  it('matches the published test vector (236 -> 3)', () => {
    expect(verhoeffCheckDigit('236')).toBe(3);
    expect(isValidVerhoeff('2363')).toBe(true);
  });

  it.each(['234123412346', '498765432102', '567812345678', '345678901238', '876543210988'])(
    'accepts fictional valid number %s',
    (n) => expect(isValidVerhoeff(n)).toBe(true),
  );

  it.each(['234123412347', '498765432103', '567812345679', '345678901239', '876543210989'])(
    'rejects wrong check digit %s',
    (n) => expect(isValidVerhoeff(n)).toBe(false),
  );

  it('catches swapped neighbouring digits', () => {
    expect(isValidVerhoeff('243123412346')).toBe(false);
  });

  it.each(['', '7', '2341 2341 2346', 'abc'])('rejects non-digit or too-short input %j', (n) =>
    expect(isValidVerhoeff(n)).toBe(false),
  );

  it('builds check digits that validate', () => {
    for (const base of ['12345678901', '99999999999', '20000000000']) {
      expect(isValidVerhoeff(base + verhoeffCheckDigit(base))).toBe(true);
    }
  });
});
