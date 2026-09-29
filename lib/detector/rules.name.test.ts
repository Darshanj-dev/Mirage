import { describe } from 'vitest';
import { nameRule } from './contextRules';
import { describeRule } from './ruleTestUtils';

describe('NAME rule', () => {
  describeRule(
    nameRule,
    [
      ["Hi, I'm Priya Nair. My PAN is ABCDE1234F", 'Priya Nair'],
      ['my name is Ramesh Kumar and I need help', 'Ramesh Kumar'],
      ['Book an appointment with Dr. Rao tomorrow', 'Rao'],
      ['draft a notice for my tenant Suresh Iyer', 'Suresh Iyer'],
      ["I'm Kavya, 21, looking for internships", 'Kavya'],
      ['Dear Anita, thanks for the update', 'Anita'],
      ['Regards,\nNinad Pandith', 'Ninad Pandith'],
      ['Name: Lakshmi Venkatesh', 'Lakshmi Venkatesh'],
      ['Name: Rahul Sharma\nDate of Birth: 14 March 2002', 'Rahul Sharma'],
    ],
    [
      "I'm Indian and want to visit Japan",
      "I'm stuck on a Python error",
      'Dear Sir, please find attached',
      'Hello World program in Java',
      "I'm Sorry for the delay",
      'the function is named getUser',
      'I am using React',
      'Hi team, standup at 10',
    ],
  );
});
