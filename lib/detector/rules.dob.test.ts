import { describe } from 'vitest';
import { dobRule } from './contextRules';
import { describeRule } from './ruleTestUtils';

describe('DOB rule', () => {
  describeRule(
    dobRule,
    [
      ['DOB: 12/03/1998', '12/03/1998'],
      ['date of birth 1998-03-12', '1998-03-12'],
      ['I was born on 12 March 1998 in Mysuru', '12 March 1998'],
      ['birthday is March 12, 1998', 'March 12, 1998'],
      ['D.O.B. 05-11-2001', '05-11-2001'],
    ],
    [
      'meeting on 12/03/2026',
      'born in 1998',
      'the invoice date 1998-03-12',
      'birthday party ideas for a 5 year old',
      'deadline: March 12, 2026',
    ],
  );
});
