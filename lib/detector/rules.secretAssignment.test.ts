import { describe } from 'vitest';
import { secretAssignmentRule } from './rules';
import { describeRule } from './ruleTestUtils';

// Made-up values in the shape of secrets.
describe('secret assignment rule (API_KEY)', () => {
  describeRule(
    secretAssignmentRule,
    [
      ['STRIPE_SECRET=whsec9fK2mQ7xL4', 'whsec9fK2mQ7xL4'],
      ['"client_secret": "Qm9vbGVhbi1zZWNyZXQtMTIz"', 'Qm9vbGVhbi1zZWNyZXQtMTIz'],
      ["apiKey: 'a8F3kL0pQ2zX9mN1'", 'a8F3kL0pQ2zX9mN1'],
      ['GET /v1/data?api_key=Zk29xQ81LmPw7Rt&limit=5', 'Zk29xQ81LmPw7Rt'],
      ['export SLACK_BOT_TOKEN=bot-83hf92-kd82j', 'bot-83hf92-kd82j'],
      ['access_token = "ya29.a0AfH6SMfake123"', 'ya29.a0AfH6SMfake123'],
      ['X-API-Key: 7c2f9a1e-live-88', '7c2f9a1e-live-88'],
    ],
    [
      'api_key = os.getenv("API_KEY")',
      'const token = config.auth.token',
      'API_KEY=<your-api-key-here>',
      'token: 5',
      'max_tokens=1000',
      'secret_santa: true',
      'SECRET_KEY = SETTINGS_SECRET_KEY',
      'the api key is stored in the vault',
      'token = "example-token-value"',
    ],
  );
});
