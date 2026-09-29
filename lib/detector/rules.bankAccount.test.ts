import { describe } from 'vitest';
import { bankAccountRule } from './contextRules';
import { describeRule } from './ruleTestUtils';

describe('BANK_ACCOUNT rule', () => {
  describeRule(
    bankAccountRule,
    [
      ['account no 50100234567890', '50100234567890'],
      ['A/c No. 012345678901, IFSC SBIN0001234', '012345678901'],
      ['my savings account number is 3456 7890 1234', '3456 7890 1234'],
      ['acct #: 918020012345678', '918020012345678'],
      ['Account Number: 123456789', '123456789'],
    ],
    [
      'order number 50100234567890',
      'account balance 50000',
      'account no 12345', // too short
      'account no 0000000000', // not a real number
      'my account was locked, call 9845012345',
      'the accounting team needs 4 reports',
    ],
  );
});
