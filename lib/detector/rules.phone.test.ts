import { describe } from 'vitest';
import { phoneRule } from './rules';
import { describeRule } from './ruleTestUtils';

describe('PHONE rule', () => {
  describeRule(
    phoneRule,
    [
      ['call me on 98450 12345', '98450 12345'],
      ['phone +91 9845012345', '+91 9845012345'],
      ['WhatsApp: +91-98450-12345.', '+91-98450-12345'],
      ['landline style 09845012345', '09845012345'],
      ['my number is 7012345678, thanks', '7012345678'],
      ['reach me at 812 345 6789', '812 345 6789'],
      ['+919876543210', '+919876543210'],
    ],
    [
      'Order ID 1234567890', // starts with 1
      'PIN code 560001',
      'price ₹98,450.00',
      'count 984501234', // 9 digits
      'account 98450123456789', // too long
      'date 2026-09-28',
      'ABC9845012345', // glued to letters
    ],
  );
});
