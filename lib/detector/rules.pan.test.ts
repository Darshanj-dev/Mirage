import { describe } from 'vitest';
import { panRule } from './rules';
import { describeRule } from './ruleTestUtils';

describe('PAN rule', () => {
  describeRule(
    panRule,
    [
      ['My PAN is ABCDE1234F', 'ABCDE1234F'],
      ['PAN: BNZPM2501K.', 'BNZPM2501K'],
      ['client PAN (AAACR5055K) for invoice', 'AAACR5055K'],
      ['GST filing with PAN XYZAB9876C today', 'XYZAB9876C'],
      ['PQRST0001Z', 'PQRST0001Z'],
    ],
    [
      'abcde1234f in lowercase', // PANs are written in capitals
      'ABCD1234F has only 4 letters',
      'ABCDEF1234G has 6 letters',
      'ABCDE12345 ends in a digit',
      'Model XABCDE1234FY is a part number', // glued into a longer token
      'SBIN0001234 is an IFSC code',
    ],
  );
});
