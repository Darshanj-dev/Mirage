// Shared detector types (docs/app-flow.md, Message contracts; docs/schema.md, Vault).

export type Policy = 'mask' | 'block';

/** Personal data: hidden behind a placeholder and put back in the reply. */
export type MaskType = 'AADHAAR' | 'PAN' | 'PHONE' | 'EMAIL' | 'UPI' | 'IFSC' | 'NAME' | 'CUSTOM';

/** Secrets: never tokenized, the send is blocked. */
export type SecretType = 'CARD' | 'API_KEY' | 'PASSWORD' | 'OTP';

export type FindingType = MaskType | SecretType;

export interface Finding {
  type: FindingType;
  start: number; // index in the prompt text
  end: number; // exclusive
  value: string;
  policy: Policy; // secrets are always 'block'
}

/** The parts of the user's settings the detector needs. */
export interface DetectSettings {
  safeWords: readonly string[]; // never hidden
  alwaysMask: readonly string[]; // always hidden (usually the user's own name)
}

/** A match produced by one rule, before policy and overlap handling. */
export interface Match {
  start: number;
  end: number;
  value: string;
}

export interface Rule {
  type: FindingType;
  policy: Policy;
  find(text: string): Match[];
}

export const SECRET_TYPES: readonly SecretType[] = ['CARD', 'API_KEY', 'PASSWORD', 'OTP'];

export function isSecretType(type: FindingType): type is SecretType {
  return (SECRET_TYPES as readonly FindingType[]).includes(type);
}
