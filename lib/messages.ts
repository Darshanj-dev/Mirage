// Every internal message between the page, the popup and the service worker
// (docs/app-flow.md, Message contracts; docs/schema.md, Message types).
// Messages never carry the whole prompt: only findings, placeholders, settings or counts.

import { browser } from 'wxt/browser';
import { MASK_TYPES, type MaskType } from './detector/types';
import type { Counts, Settings, Site, Stats } from './settings';
import { SITE_IDS } from './sites/hosts';

export interface TokenizeRequest {
  type: 'TOKENIZE';
  site: Site;
  chatId: string;
  findings: { type: MaskType; value: string }[]; // personal details only, never secrets
}

/** Same as TOKENIZE but saves nothing: the placeholders shown on hover while typing. */
export interface PreviewRequest {
  type: 'PREVIEW';
  site: Site;
  chatId: string;
  findings: { type: MaskType; value: string }[];
}

export interface RestoreRequest {
  type: 'RESTORE';
  site: Site;
  chatId: string;
  tokens: string[];
}

export interface RenameChatRequest {
  type: 'RENAME_CHAT';
  site: Site;
  fromChatId: string; // temporary id of a new, unsaved chat
  toChatId: string; // id from the URL once the chat is saved
}

export interface GetSettingsRequest {
  type: 'GET_SETTINGS';
}

/** Settings a page or the popup may change; protectedSendCount etc. are included for the Quick mode offer. */
export type SettingsPatch = Partial<Omit<Settings, 'v'>>;

export interface SetSettingsRequest {
  type: 'SET_SETTINGS';
  settings?: SettingsPatch;
  alwaysMask?: string[]; // replaces the whole Always mask list when present
}

/** The page has shown the first-run hint (the badge pulse); don't show it again. */
export interface OnboardingDoneRequest {
  type: 'ONBOARDING_DONE';
}

export interface ClearVaultRequest {
  type: 'CLEAR_VAULT';
}

export interface GetStatsRequest {
  type: 'GET_STATS';
}

export interface CountRequest {
  type: 'COUNT';
  delta: Partial<Counts>; // numbers only, never content
}

export type Request =
  | TokenizeRequest
  | PreviewRequest
  | RestoreRequest
  | RenameChatRequest
  | GetSettingsRequest
  | SetSettingsRequest
  | OnboardingDoneRequest
  | ClearVaultRequest
  | GetStatsRequest
  | CountRequest;

export type RequestType = Request['type'];

export interface SettingsResult {
  settings: Settings;
  alwaysMask: string[];
  firstRun: boolean; // true until the first-run hint has been shown on a chatbot page
}

export interface ResultMap {
  TOKENIZE: { tokens: string[] };
  PREVIEW: { tokens: string[] };
  RESTORE: { values: Record<string, string>; found: boolean };
  RENAME_CHAT: { renamed: boolean };
  GET_SETTINGS: SettingsResult;
  SET_SETTINGS: SettingsResult;
  ONBOARDING_DONE: Record<string, never>;
  CLEAR_VAULT: { cleared: number };
  GET_STATS: { stats: Stats };
  COUNT: Record<string, never>;
}

export type Response<T extends RequestType> = ({ ok: true } & ResultMap[T]) | { ok: false; error: string };

// ---------------------------------------------------------------- validation (service worker side)

const SITES: readonly string[] = SITE_IDS;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isChatId = (v: unknown): v is string => isString(v) && v.length > 0 && v.length <= 200;
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

/**
 * Checks the shape of an incoming message. TOKENIZE with a secret type is rejected:
 * secrets are blocked, never stored.
 */
export function isRequest(msg: unknown): msg is Request {
  if (!isObject(msg) || !isString(msg.type)) return false;
  switch (msg.type) {
    case 'TOKENIZE':
    case 'PREVIEW':
      return (
        isString(msg.site) &&
        SITES.includes(msg.site) &&
        isChatId(msg.chatId) &&
        Array.isArray(msg.findings) &&
        msg.findings.length <= 200 &&
        msg.findings.every(
          (f) => isObject(f) && isString(f.type) && (MASK_TYPES as readonly string[]).includes(f.type) && isString(f.value) && f.value.length <= 500,
        )
      );
    case 'RESTORE':
      return isString(msg.site) && SITES.includes(msg.site) && isChatId(msg.chatId) && isStringArray(msg.tokens) && msg.tokens.length <= 500;
    case 'RENAME_CHAT':
      return isString(msg.site) && SITES.includes(msg.site) && isChatId(msg.fromChatId) && isChatId(msg.toChatId);
    case 'SET_SETTINGS':
      return (
        (msg.settings === undefined || isObject(msg.settings)) &&
        (msg.alwaysMask === undefined || isStringArray(msg.alwaysMask))
      );
    case 'COUNT':
      return isObject(msg.delta);
    case 'GET_SETTINGS':
    case 'ONBOARDING_DONE':
    case 'CLEAR_VAULT':
    case 'GET_STATS':
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------- who may send what

/**
 * Where a message came from. A content script runs inside the chatbot's page process, so it is
 * trusted less than MIRAGE's own pages: if that process were ever compromised, it must not be
 * able to turn protection off, clear the vault, or read another site's saved details.
 */
export type Sender = { kind: 'extension' } | { kind: 'page'; site: Site | null };

/** Settings a chatbot page may change: only what its own UI offers. */
const PAGE_SETTING_KEYS: readonly string[] = ['quickModeOffered', 'protectedSendCount', 'safeWords', 'enabled', 'quickMode'];

export function isAllowedFrom(sender: Sender, msg: Request): boolean {
  if (sender.kind === 'extension') return true;
  switch (msg.type) {
    case 'TOKENIZE':
    case 'PREVIEW':
    case 'RESTORE':
    case 'RENAME_CHAT':
      // A page may only read and write its own site's saved details.
      return msg.site === sender.site;
    case 'SET_SETTINGS': {
      if (msg.alwaysMask !== undefined) return false;
      const patch = msg.settings ?? {};
      if (!Object.keys(patch).every((k) => PAGE_SETTING_KEYS.includes(k))) return false;
      // The page can turn protection on (the badge's "Click to turn on"), never off.
      return patch.enabled !== false && patch.quickMode !== false;
    }
    case 'GET_SETTINGS':
    case 'ONBOARDING_DONE':
    case 'COUNT':
      return true;
    case 'CLEAR_VAULT':
    case 'GET_STATS':
      return false;
  }
}

// ---------------------------------------------------------------- sending (page and popup side)

/**
 * Sends a message to the service worker. Never throws: a missing or failed response
 * comes back as { ok: false }, which callers treat as "block the send".
 */
export async function sendMessage<R extends Request>(request: R): Promise<Response<R['type']>> {
  try {
    const response: unknown = await browser.runtime.sendMessage(request);
    if (isObject(response) && typeof response.ok === 'boolean') return response as Response<R['type']>;
    return { ok: false, error: 'No response from MIRAGE' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Message failed' };
  }
}

// ---------------------------------------------------------------- Private Compose (panel → page)

/**
 * Sent by the Private Compose panel to the content script of the chatbot tab. The raw prompt goes
 * from MIRAGE's panel to MIRAGE's content script (the extension's isolated world), never into the
 * page: the content script writes only the protected version into the chatbot's prompt box.
 */
export interface InsertProtectedCommand {
  type: 'INSERT_PROTECTED';
  text: string;
  keep: number[]; // finding indexes the user chose to send as typed
}

export type InsertProtectedResult =
  | { ok: true; hidden: number; removed: number }
  | { ok: false; error: 'noPromptBox' | 'writeFailed' | 'tokenizeFailed' | 'off' };

export function isInsertProtected(msg: unknown): msg is InsertProtectedCommand {
  return (
    isObject(msg) &&
    msg.type === 'INSERT_PROTECTED' &&
    isString(msg.text) &&
    msg.text.length <= 100_000 &&
    Array.isArray(msg.keep) &&
    msg.keep.every((k) => typeof k === 'number')
  );
}
