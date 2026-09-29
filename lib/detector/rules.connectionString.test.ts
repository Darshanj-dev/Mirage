import { describe, expect, it } from 'vitest';
import { connectionStringRule } from './rules';
import { describeRule } from './ruleTestUtils';

describe('connection string rule (PASSWORD)', () => {
  describeRule(
    connectionStringRule,
    [
      ['DATABASE_URL=postgres://admin:S3cr3tPass@db.internal:5432/prod', 'S3cr3tPass'],
      ['mongodb+srv://app:Mdb%40pass99@cluster0.abcd.mongodb.net/test', 'Mdb%40pass99'],
      ['redis://default:r3d1sKey!@cache:6379', 'r3d1sKey!'],
      ['git clone https://ninad:ghToken2026x@github.com/org/repo.git', 'ghToken2026x'],
      ['mysql://root:hunter22@127.0.0.1:3306/shop', 'hunter22'],
      ['amqp://guest:Rabbit_7@mq.local/', 'Rabbit_7'],
    ],
    [
      'postgres://user:password@localhost:5432/db', // documentation placeholder
      'postgres://localhost:5432/db',
      'https://example.com/path?x=1',
      'mysql://user:${DB_PASSWORD}@db/app',
      'email me at priya@example.com',
      'ssh git@github.com',
    ],
  );

  it('takes only the password, so the user and host stay visible', () => {
    const [m] = connectionStringRule.find('postgres://admin:S3cr3tPass@db.internal/prod');
    expect(m?.value).toBe('S3cr3tPass');
    expect(m?.kind).toBe('connection_string');
  });

  it('names web URLs with a password as URL credentials', () => {
    expect(connectionStringRule.find('https://bob:Pa55word9@example.com')[0]?.kind).toBe('url_credentials');
  });
});
