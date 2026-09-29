import { describe } from 'vitest';
import { passportRule } from './contextRules';
import { describeRule } from './ruleTestUtils';

describe('PASSPORT rule', () => {
  describeRule(
    passportRule,
    [
      ['my passport number is K1234567', 'K1234567'],
      ['Passport: J8369854, expires 2031', 'J8369854'],
      ['passport no. t7654321 for the visa form', 't7654321'],
      ['Renew passport M2345678 before travel', 'M2345678'],
      ['passport N12 34567', 'N12 34567'],
    ],
    [
      'order K1234567 shipped',
      'ticket J8369854 confirmed',
      'passport office timings',
      'passport Q1234567', // Q is not used
      'my passport is K12345', // too short
      'passport K0234567', // no leading zero
    ],
  );
});
