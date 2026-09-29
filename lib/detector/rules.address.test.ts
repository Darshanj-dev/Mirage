import { describe } from 'vitest';
import { addressRule } from './contextRules';
import { describeRule } from './ruleTestUtils';

describe('ADDRESS rule', () => {
  describeRule(
    addressRule,
    [
      ['Deliver to #12, 3rd Cross, Indiranagar, Bengaluru 560038 please', '#12, 3rd Cross, Indiranagar, Bengaluru 560038'],
      ['My address is 45 MG Road, Pune 411001.', '45 MG Road, Pune 411001'],
      ['address: Flat 3B, Lake View Apartments, Kochi 682 020', 'Flat 3B, Lake View Apartments, Kochi 682 020'],
      ['Office: 7th Floor, Tower B, Sector 62, Noida 201309', '7th Floor, Tower B, Sector 62, Noida 201309'],
      ['send it to 221 Baker Street, Mumbai 400050', '221 Baker Street, Mumbai 400050'],
    ],
    [
      'the road to 560038 is long',
      'our PIN code is 560038',
      'Street food ideas for a party',
      'He lives on Main Street',
      'Invoice 400050 is due',
    ],
  );
});
