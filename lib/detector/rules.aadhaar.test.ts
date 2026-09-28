import { describe } from 'vitest';
import { aadhaarRule } from './rules';
import { describeRule } from './ruleTestUtils';

// All numbers are fictional, generated with a valid Verhoeff check digit.
describe('AADHAAR rule', () => {
  describeRule(
    aadhaarRule,
    [
      ['My Aadhaar is 2341 2341 2346', '2341 2341 2346'],
      ['aadhaar: 498765432102', '498765432102'],
      ['UID 5678-1234-5678 for KYC', '5678-1234-5678'],
      ['Number (3456 7890 1238) linked to my bank', '3456 7890 1238'],
      ['8765 4321 0988.', '8765 4321 0988'],
      ['Aadhaar no.9123 4567 8905 please verify', '9123 4567 8905'],
    ],
    [
      'Order number 234123412347 was delivered', // fails Verhoeff
      'Tracking 4987 6543 2103', // fails Verhoeff
      'Invoice 123412341234', // starts with 1
      'Ref 0234 1234 1234', // starts with 0
      'Account 2341234123460', // 13 digits
      'ID 23412341234', // 11 digits
      'Mixed grouping 2341 23412346', // inconsistent separators
      'Code ABC234123412346', // glued to letters
      'UUID 123e4567-e89b-12d3-a456-426614174000', // tail passes Verhoeff by chance
    ],
  );
});
