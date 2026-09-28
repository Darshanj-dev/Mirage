import { describe } from 'vitest';
import { emailRule } from './rules';
import { describeRule } from './ruleTestUtils';

describe('EMAIL rule', () => {
  describeRule(
    emailRule,
    [
      ['mail me at priya.nair@example.com', 'priya.nair@example.com'],
      ['Email: ramesh_k+health@mail.example.in.', 'ramesh_k+health@mail.example.in'],
      ['(anita@office-example.co.in)', 'anita@office-example.co.in'],
      ['arjun.dev99@example.org, thanks', 'arjun.dev99@example.org'],
      ['HOD email HOD.CSE@college.example.edu', 'HOD.CSE@college.example.edu'],
    ],
    [
      'pay to priya@okaxis', // UPI, no dot after @
      'just an @mention here',
      'the @ sign alone',
      'user@localhost has no dot',
      'npm install wxt@latest',
      'price is 5@10.00',
    ],
  );
});
