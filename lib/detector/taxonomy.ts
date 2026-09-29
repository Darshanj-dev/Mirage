// One table per fact about each kind of detail, so severity, grouping, risk weight and
// placeholder label are defined in exactly one place (docs/detection.md explains the values).

import type { Category, FindingType, SecretKind, SecretType, Severity } from './types';

/**
 * How bad it is if this one item reaches the AI provider.
 * critical: grants access to an account or money on its own.
 * high:     a government or bank identifier; enables fraud or KYC abuse.
 * medium:   identifies or reaches a person (name, phone, UPI, date of birth, health context).
 * low:      useful to an attacker only in combination (email, IFSC, IP address).
 */
export const SEVERITY: Record<FindingType, Severity> = {
  API_KEY: 'critical',
  PRIVATE_KEY: 'critical',
  PASSWORD: 'critical',
  CARD: 'critical',
  OTP: 'critical',
  AADHAAR: 'high',
  PAN: 'high',
  BANK_ACCOUNT: 'high',
  PASSPORT: 'high',
  ADDRESS: 'medium',
  PHONE: 'medium',
  UPI: 'medium',
  NAME: 'medium',
  CUSTOM: 'medium',
  DOB: 'medium',
  HEALTH: 'medium',
  EMAIL: 'low',
  IFSC: 'low',
  IP_ADDRESS: 'low',
};

export const CATEGORY: Record<FindingType, Category> = {
  AADHAAR: 'identity',
  PAN: 'identity',
  DOB: 'identity',
  NAME: 'identity',
  CUSTOM: 'identity',
  PASSPORT: 'identity',
  ADDRESS: 'location',
  PHONE: 'contact',
  EMAIL: 'contact',
  CARD: 'financial',
  BANK_ACCOUNT: 'financial',
  UPI: 'financial',
  IFSC: 'financial',
  PASSWORD: 'credentials',
  OTP: 'credentials',
  PRIVATE_KEY: 'credentials',
  API_KEY: 'apiKeys',
  IP_ADDRESS: 'location',
  HEALTH: 'health',
};

export const CATEGORIES: readonly Category[] = ['identity', 'contact', 'financial', 'credentials', 'apiKeys', 'location', 'health'];

/**
 * Risk points for one item at full confidence (lib/risk.ts). Chosen so that one item of each
 * severity lands in the matching band on its own: critical ≥ 50, high 30-35, medium 10-15, low 5-10.
 */
export const WEIGHT: Record<FindingType, number> = {
  API_KEY: 60,
  PRIVATE_KEY: 60,
  PASSWORD: 55,
  CARD: 55,
  OTP: 50,
  AADHAAR: 35,
  PAN: 30,
  BANK_ACCOUNT: 30,
  PASSPORT: 30,
  ADDRESS: 15,
  DOB: 15,
  UPI: 15,
  PHONE: 12,
  NAME: 12,
  CUSTOM: 12,
  HEALTH: 10,
  EMAIL: 10,
  IP_ADDRESS: 8,
  IFSC: 5,
};

/** Placeholder label for a removed secret, e.g. «AWS_SECRET_KEY_REMOVED». */
export const SECRET_LABEL: Record<SecretType, string> = {
  CARD: 'CARD',
  API_KEY: 'API_KEY',
  PRIVATE_KEY: 'PRIVATE_KEY',
  PASSWORD: 'PASSWORD',
  OTP: 'OTP',
};

export const KIND_LABEL: Partial<Record<SecretKind, string>> = {
  aws_access_key: 'AWS_ACCESS_KEY',
  aws_secret_key: 'AWS_SECRET_KEY',
  openai: 'OPENAI_KEY',
  anthropic: 'ANTHROPIC_KEY',
  github: 'GITHUB_TOKEN',
  gitlab: 'GITLAB_TOKEN',
  google: 'GOOGLE_API_KEY',
  slack: 'SLACK_TOKEN',
  stripe: 'STRIPE_KEY',
  jwt: 'JWT',
  bearer: 'TOKEN',
  connection_string: 'DB_PASSWORD',
  url_credentials: 'PASSWORD',
  webhook: 'WEBHOOK_URL',
};
