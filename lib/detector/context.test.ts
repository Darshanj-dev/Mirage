import { describe, expect, it } from 'vitest';
import { detect } from './detect';

const one = (text: string) => detect(text)[0];

describe('context scoring', () => {
  it('raises confidence when a word says what the value is', () => {
    expect(one('call me on 9845012345')!.confidence).toBeGreaterThan(one('reference 9845012345')!.confidence);
    expect(one('call me on 9845012345')!.context).toBe('call');
  });

  it('lowers confidence for examples but never drops a secret', () => {
    const f = one('for example password: tiger2026');
    expect(f?.type).toBe('PASSWORD');
    expect(f?.policy).toBe('block');
    expect(f!.confidence).toBeLessThan(0.9);
  });

  it('drops placeholder values like XXXXX1234X', () => {
    expect(detect('My PAN is XXXXX1234X')).toEqual([]);
  });

  it('treats "the password field contains 8 characters" as no password', () => {
    expect(detect('The password field contains 8 characters.')).toEqual([]);
  });

  it('gives every finding a severity, category, reason and action', () => {
    const f = one('sk-proj-Xq7Lm2Rt9Vb4Nc8Kd1Pf6Hs3Wz5Jy0Ag')!;
    expect(f).toMatchObject({ type: 'API_KEY', kind: 'openai', severity: 'critical', category: 'apiKeys', reason: 'knownFormat', policy: 'block' });
  });

  it('lets category switches turn detection off, except Always hide terms', () => {
    const settings = { safeWords: [], alwaysMask: ['Acme'], categories: { contact: false } };
    expect(detect('mail a@b.example.com at Acme', settings).map((f) => f.type)).toEqual(['CUSTOM']);
  });
});

describe('placeholders', () => {
  it('never flags MIRAGE’s own placeholders, so a protected prompt checks clean', () => {
    const text = 'AWS_SECRET_ACCESS_KEY=«AWS_SECRET_KEY_REMOVED»\napi_key: «API_KEY_REMOVED»\nMy PAN is «PAN_1», mail «EMAIL_1»';
    expect(detect(text)).toEqual([]);
  });
});

describe('audit cases (docs/audit-report.md)', () => {
  const aws = ['wJalrXUtnFEMI', 'K7MDENG', 'bPxRfiCYzYXkEyQ9'].join('/') + 'Ab'; // 40 chars, made up
  it('blocks the password inside a connection string instead of hiding it as an email', () => {
    expect(detect('DATABASE_URL=postgres://admin:S3cr3tPass@db.internal:5432/prod').map((f) => [f.type, f.value, f.policy])).toEqual([
      ['PASSWORD', 'S3cr3tPass', 'block'],
    ]);
  });
  it('blocks a named AWS secret access key', () => {
    expect(detect(`aws_secret_access_key = ${aws}`).map((f) => [f.type, f.kind])).toEqual([['API_KEY', 'aws_secret_key']]);
  });
  it('hides IP addresses and labelled bank accounts', () => {
    expect(detect('server at 10.0.12.7, account no 50100234567890').map((f) => f.type)).toEqual(['IP_ADDRESS', 'BANK_ACCOUNT']);
  });
  it('hides a lowercase PAN after the word PAN', () => {
    expect(detect('my pan is abcde1234f').map((f) => f.type)).toEqual(['PAN']);
  });
  it('flags health details in the deck prompt and hides the name', () => {
    const text =
      "Hi, I'm Priya Nair. My PAN is ABCDE1234F and my number is 98450 12345. My HbA1c came back at 7.9, what does that mean? Also draft a sick-leave mail to hod.cse@pu.edu.in.";
    expect(detect(text).map((f) => [f.type, f.policy])).toEqual([
      ['NAME', 'mask'],
      ['PAN', 'mask'],
      ['PHONE', 'mask'],
      ['HEALTH', 'warn'],
      ['EMAIL', 'mask'],
    ]);
  });
});
