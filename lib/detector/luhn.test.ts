import { describe, expect, it } from 'vitest';
import { isValidLuhn } from './luhn';

describe('luhn', () => {
  // Published test card numbers, not real cards.
  it.each(['4111111111111111', '5555555555554444', '378282246310005', '6011111111111117', '4012888888881881', '3530111333300000'])(
    'accepts test card %s',
    (n) => expect(isValidLuhn(n)).toBe(true),
  );

  it.each(['4111111111111112', '5555555555554445', '378282246310006', '1234567812345678', '6011111111111118'])(
    'rejects %s',
    (n) => expect(isValidLuhn(n)).toBe(false),
  );

  it.each(['', '4', '4111 1111 1111 1111', 'abcd'])('rejects non-digit or too-short input %j', (n) =>
    expect(isValidLuhn(n)).toBe(false),
  );
});
