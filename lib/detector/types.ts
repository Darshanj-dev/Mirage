// Shared detector types (docs/app-flow.md, Message contracts; docs/schema.md, Vault).

/**
 * What MIRAGE recommends for a finding:
 * - mask:  personal data, hidden behind a placeholder and put back in the reply
 * - block: a secret, removed before sending and never stored
 * - warn:  sensitive context the AI needs to answer (e.g. a lab value); kept, but it raises
 *          the risk score and the user is told why
 */
export type Policy = 'mask' | 'block' | 'warn';

/** Personal data: hidden behind a placeholder and put back in the reply. */
export type MaskType =
  | 'AADHAAR'
  | 'PAN'
  | 'PHONE'
  | 'EMAIL'
  | 'UPI'
  | 'IFSC'
  | 'BANK_ACCOUNT'
  | 'IP_ADDRESS'
  | 'DOB'
  | 'ADDRESS'
  | 'PASSPORT'
  | 'NAME'
  | 'CUSTOM';

/** Secrets: never tokenized, never stored; removed or the send is stopped. */
export type SecretType = 'CARD' | 'API_KEY' | 'PRIVATE_KEY' | 'PASSWORD' | 'OTP';

/** Kept in the prompt, but counted in the risk score. */
export type WarnType = 'HEALTH';

export type FindingType = MaskType | SecretType | WarnType;

export type Severity = 'low' | 'medium' | 'high' | 'critical';

/** Groups the user can turn on and off in settings. */
export type Category = 'identity' | 'contact' | 'financial' | 'credentials' | 'apiKeys' | 'location' | 'health';

/** Why a rule matched, shown to the user as the explanation. */
export type Reason =
  | 'checksum' // passes the ID's own check digit (Verhoeff, Luhn)
  | 'knownFormat' // matches a published key or token format
  | 'pattern' // matches the shape of the ID
  | 'context' // a nearby word says what it is ("password:", "account no")
  | 'assignment' // assigned to a secret-looking name (API_KEY=…)
  | 'entropy' // long random-looking string
  | 'custom'; // on the user's Always hide list

/** A more specific name for a secret, e.g. "an AWS secret key". Used for display and placeholders. */
export type SecretKind =
  | 'openai'
  | 'anthropic'
  | 'aws_access_key'
  | 'aws_secret_key'
  | 'github'
  | 'gitlab'
  | 'google'
  | 'google_oauth'
  | 'slack'
  | 'stripe'
  | 'jwt'
  | 'bearer'
  | 'npm'
  | 'huggingface'
  | 'sendgrid'
  | 'twilio'
  | 'webhook'
  | 'telegram'
  | 'env_secret'
  | 'high_entropy'
  | 'connection_string'
  | 'url_credentials';

export interface Finding {
  type: FindingType;
  start: number; // index in the prompt text as typed
  end: number; // exclusive
  value: string; // exactly text.slice(start, end)
  policy: Policy; // recommended action; secrets are always 'block'
  category: Category;
  severity: Severity;
  confidence: number; // 0..1, after context scoring
  reason: Reason;
  kind?: SecretKind;
  /** The nearby word that confirmed it, e.g. "phone". */
  context?: string;
}

/** The parts of the user's settings the detector needs. */
export interface DetectSettings {
  safeWords: readonly string[]; // never hidden
  alwaysMask: readonly string[]; // always hidden (usually the user's own name)
  /** Categories turned off in settings. Missing means on. */
  categories?: Partial<Record<Category, boolean>>;
}

/** A match produced by one rule, before policy, context scoring and overlap handling. */
export interface Match {
  start: number;
  end: number;
  value: string;
  kind?: SecretKind;
  confidence?: number; // overrides the rule's base confidence
  reason?: Reason; // overrides the rule's reason
}

export interface Rule {
  type: FindingType;
  policy: Policy;
  /** Confidence when the rule matches with no extra signal. */
  confidence: number;
  reason: Reason;
  find(text: string): Match[];
}

export const SECRET_TYPES: readonly SecretType[] = ['CARD', 'API_KEY', 'PRIVATE_KEY', 'PASSWORD', 'OTP'];

export const MASK_TYPES: readonly MaskType[] = [
  'AADHAAR',
  'PAN',
  'PHONE',
  'EMAIL',
  'UPI',
  'IFSC',
  'BANK_ACCOUNT',
  'IP_ADDRESS',
  'DOB',
  'ADDRESS',
  'PASSPORT',
  'NAME',
  'CUSTOM',
];

export function isSecretType(type: FindingType): type is SecretType {
  return (SECRET_TYPES as readonly FindingType[]).includes(type);
}

export function isMaskType(type: FindingType): type is MaskType {
  return (MASK_TYPES as readonly FindingType[]).includes(type);
}
