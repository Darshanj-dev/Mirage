import { describe } from 'vitest';
import { upiRule } from './rules';
import { describeRule } from './ruleTestUtils';

describe('UPI rule', () => {
  describeRule(
    upiRule,
    [
      ['pay me at priya@okaxis', 'priya@okaxis'],
      ['UPI: 9845012345@ybl.', '9845012345@ybl'],
      ['send to anita.m@okhdfcbank now', 'anita.m@okhdfcbank'],
      ['(ramesh-k@paytm)', 'ramesh-k@paytm'],
      ['upi id arjun_99@ibl, thanks', 'arjun_99@ibl'],
    ],
    [
      'email priya@example.com', // dot after @ means email
      'npm install wxt@latest',
      'git checkout origin@main',
      'reply to @priya on Slack',
      'a@b single letters',
      'ratio 5@10',
    ],
  );
});
