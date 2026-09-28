import { describe } from 'vitest';
import { ifscRule } from './rules';
import { describeRule } from './ruleTestUtils';

describe('IFSC rule', () => {
  describeRule(
    ifscRule,
    [
      ['IFSC SBIN0001234', 'SBIN0001234'],
      ['branch code HDFC0ABC123.', 'HDFC0ABC123'],
      ['(ICIC0004567) Koramangala', 'ICIC0004567'],
      ['bank: UTIB0000789, account below', 'UTIB0000789'],
      ['KKBK0008088', 'KKBK0008088'],
    ],
    [
      'SBIN1001234 fifth character is not 0',
      'sbin0001234 lowercase',
      'SBI00001234 only 3 letters',
      'SBIN000123 too short',
      'XSBIN0001234 glued to a letter',
      'ABCDE1234F is a PAN',
    ],
  );
});
