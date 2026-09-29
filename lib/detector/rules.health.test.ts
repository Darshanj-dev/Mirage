import { describe } from 'vitest';
import { healthRule } from './contextRules';
import { describeRule } from './ruleTestUtils';

describe('HEALTH rule (warn)', () => {
  describeRule(
    healthRule,
    [
      ['My HbA1c came back at 7.9', 'HbA1c'],
      ['I was diagnosed with asthma', 'diagnosed'],
      ['is my blood pressure 150/95 high?', 'blood pressure'],
      ['HIV test result explained', 'HIV'],
      ['side effects of metformin', 'metformin'],
    ],
    [
      'I still have questions',
      'the sti file format',
      'Great sugar cookie recipe',
      'this sprint was stressful',
      'our tumbler order is late',
    ],
  );
});
