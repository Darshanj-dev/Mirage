import { describe } from 'vitest';
import { otpRule } from './rules';
import { describeRule } from './ruleTestUtils';

describe('OTP rule', () => {
  describeRule(
    otpRule,
    [
      ['My OTP is 482913', '482913'],
      ['482913 is your OTP for login', '482913'],
      ['one-time password: 7351', '7351'],
      ['verification code 90817263', '90817263'],
      ['the code is 5521.', '5521'],
      ['Enter OTP (6 digits): 104729', '104729'],
    ],
    [
      'my PIN code is 560001', // postal PIN code
      'zip code 94105',
      'error code 4040 in the logs',
      'why is this code failing on line 1234', // digits not right after "code"
      'OTP expired, please resend', // no digits
      'Aadhaar 2341 2341 2346 needs OTP', // digits belong to a longer number
      'price 1999 rupees',
    ],
  );
});
