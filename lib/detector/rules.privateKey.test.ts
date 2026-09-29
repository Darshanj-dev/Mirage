import { describe } from 'vitest';
import { privateKeyRule } from './rules';
import { describeRule } from './ruleTestUtils';

// Built at runtime so the repo never holds a string in real key format. The body is made up.
const line = (label: string) => `-----${label}-----`;
const body = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7\nq3Zx8fakefakefakefakeQIDAQAB';
const pem = (kind: string) => `${line(`BEGIN ${kind}`)}\n${body}\n${line(`END ${kind}`)}`;

describe('PRIVATE_KEY rule', () => {
  describeRule(
    privateKeyRule,
    [
      [`key:\n${pem('PRIVATE KEY')}\nwhy does ssh fail?`, pem('PRIVATE KEY')],
      [pem('RSA PRIVATE KEY'), pem('RSA PRIVATE KEY')],
      [`id_ed25519:\n${pem('OPENSSH PRIVATE KEY')}`, pem('OPENSSH PRIVATE KEY')],
      [pem('EC PRIVATE KEY'), pem('EC PRIVATE KEY')],
      [pem('ENCRYPTED PRIVATE KEY'), pem('ENCRYPTED PRIVATE KEY')],
      [`${line('BEGIN PGP PRIVATE KEY BLOCK')}\n${body}\n${line('END PGP PRIVATE KEY BLOCK')}`, `${line('BEGIN PGP PRIVATE KEY BLOCK')}\n${body}\n${line('END PGP PRIVATE KEY BLOCK')}`],
      [`half a key ${line('BEGIN RSA PRIVATE KEY')}\n${body}`, `${line('BEGIN RSA PRIVATE KEY')}\n${body}`],
    ],
    [
      `${line('BEGIN PUBLIC KEY')}\n${body}\n${line('END PUBLIC KEY')}`,
      `${line('BEGIN CERTIFICATE')}\n${body}\n${line('END CERTIFICATE')}`,
      'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFakeFakeFake user@laptop',
      'where do I keep my private key file?',
      'generate a private key with openssl genrsa',
    ],
  );
});
