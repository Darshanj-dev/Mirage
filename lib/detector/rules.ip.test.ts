import { describe } from 'vitest';
import { ipRule } from './contextRules';
import { describeRule } from './ruleTestUtils';

describe('IP_ADDRESS rule', () => {
  describeRule(
    ipRule,
    [
      ['server at 10.0.12.7 refuses ssh', '10.0.12.7'],
      ['ping 203.0.113.45', '203.0.113.45'],
      ['my home IP is 49.37.201.8.', '49.37.201.8'],
      ['allow 192.168.1.20 in the firewall', '192.168.1.20'],
      ['host=172.16.4.99:8080', '172.16.4.99'],
    ],
    [
      'listen on 127.0.0.1:3000',
      'bind 0.0.0.0',
      'netmask 255.255.255.0',
      'upgrade to v1.2.3.4',
      'version 10.0.19045.1',
      'chrome 153.0.8010.53',
      'ratio 1.5.2',
    ],
  );
});
