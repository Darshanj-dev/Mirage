import { describe } from 'vitest';
import { passwordRule } from './rules';
import { describeRule } from './ruleTestUtils';

describe('PASSWORD rule', () => {
  describeRule(
    passwordRule,
    [
      ['my password is Hunter@123.', 'Hunter@123'],
      ['password: tiger2026', 'tiger2026'],
      ['DB_PASSWORD="s3cr3t-Value"', 's3cr3t-Value'],
      ['{"password": "Qwerty!9"}', 'Qwerty!9'],
      ['pwd=letmein99 then login', 'letmein99'],
      ['wifi pass: Chai&Biscuit7', 'Chai&Biscuit7'],
      ['wifi pass: Chai&Biscuit7. Write steps for my parents.', 'Chai&Biscuit7'],
    ],
    [
      'I forgot my password, how do I reset it?',
      'the password reset link expired',
      'my password was changed yesterday',
      'passport number please', // not a password word
      'bypass: true',
      'password = process.env.DB_PASSWORD',
      'pass the salt',
    ],
  );
});
