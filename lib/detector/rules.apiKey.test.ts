import { describe } from 'vitest';
import { apiKeyRule } from './rules';
import { describeRule } from './ruleTestUtils';

// Stripe's public example test key, built at runtime so the repo holds no string
// in a real key format (GitHub push protection would block it).
const STRIPE_TEST_KEY = ['sk', 'test', '4eC39HqLyjWDarjtT1zdp7dc'].join('_');

// Every key below is fake: made-up characters in the shape of a real key.
describe('API_KEY rule', () => {
  describeRule(
    apiKeyRule,
    [
      ['const key = "sk-proj-Xq7Lm2Rt9Vb4Nc8Kd1Pf6Hs3Wz5Jy0Ag"', 'sk-proj-Xq7Lm2Rt9Vb4Nc8Kd1Pf6Hs3Wz5Jy0Ag'],
      ['AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE', 'AKIAIOSFODNN7EXAMPLE'],
      ['token: ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8', 'ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'],
      ['maps key AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q', 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q'],
      ['src="https://maps.example.com/api/js?key=AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q"', 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q'],
      [`stripe ${STRIPE_TEST_KEY}`, STRIPE_TEST_KEY],
      ['secret = "Zx8Qw3Er7Ty1Ui5Op9As2Df6Gh0Jk4Lz"', 'Zx8Qw3Er7Ty1Ui5Op9As2Df6Gh0Jk4Lz'],
      [
        'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      ],
    ],
    [
      'git commit 3f786850e387550fdab836ed7e6dc881de23001b', // hex hash
      'id 123e4567-e89b-12d3-a456-426614174000', // UUID
      'function getUserProfileByOrganizationIdentifier() {}',
      'the task-manager-service handles it',
      'sk-short', // too short to be a key
      'const PATH = "/usr/local/lib/node_modules/typescript/bin"',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ],
  );
});
