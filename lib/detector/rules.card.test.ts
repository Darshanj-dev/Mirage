import { describe } from 'vitest';
import { cardRule } from './rules';
import { describeRule } from './ruleTestUtils';

// Published test card numbers only.
describe('CARD rule', () => {
  describeRule(
    cardRule,
    [
      ['card 4111 1111 1111 1111 exp 12/27', '4111 1111 1111 1111'],
      ['Mastercard 5555-5555-5555-4444', '5555-5555-5555-4444'],
      ['amex 3782 822463 10005', '3782 822463 10005'],
      ['charge 6011111111111117 please', '6011111111111117'],
      ['number: 4012888888881881.', '4012888888881881'],
      ['JCB 3530 1113 3330 0000', '3530 1113 3330 0000'],
    ],
    [
      'card 4111 1111 1111 1112', // fails Luhn
      'order 1000234567891234', // starts with 1
      'Aadhaar 2341 2341 2346', // 12 digits
      'phone 9845012345',
      'tracking 41111111111111111111', // 20 digits
      'timestamp 1727520000000',
    ],
  );
});
