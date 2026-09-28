// Every internal message between the page, the popup and the service worker
// (docs/app-flow.md, Message contracts; docs/schema.md, Message types).
// Messages never carry the whole prompt: only findings, placeholders, settings or counts.

import { browser } from 'wxt/browser';
import type { MaskType } from './detector/types';
import type { Counts, Settings, Site, Stats } from './settings';

export interface TokenizeRequest {
  type: 'TOKENIZE';
  site: Site;
  chatId: string;
  findings: { type: MaskType; value: string }[]; // personal details only, never secrets
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
  | RestoreRequest
  | RenameChatRequest
  | GetSettingsRequest
  | SetSettingsRequest
  | ClearVaultRequest
  | GetStatsRequest
  | CountRequest;

export type RequestType = Request['type'];

export interface SettingsResult {
  settings: Settings;
  alwaysMask: string[];
}

export interface ResultMap {
  TOKENIZE: { tokens: string[] };
  RESTORE: { values: Record<string, string> };
  RENAME_CHAT: { renamed: boolean };
  GET_SETTINGS: SettingsResult;
  SET_SETTINGS: SettingsResult;
  CLEAR_VAULT: { cleared: number };
  GET_STATS: { stats: Stats };
  COUNT: Record<string, never>;
}

export type Response<T extends RequestType> = ({ ok: true } & ResultMap[T]) | { ok: false; error: string };

// ---------------------------------------------------------------- validation (service worker side)

const SITES: readonly string[] = ['chatgpt', 'gemini'];
const MASK_TYPES: readonly string[] = ['AADHAAR', 'PAN', 'PHONE', 'EMAIL', 'UPI', 'IFSC', 'NAME', 'CUSTOM'];

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
      return (
        isString(msg.site) &&
        SITES.includes(msg.site) &&
        isChatId(msg.chatId) &&
        Array.isArray(msg.findings) &&
        msg.findings.every((f) => isObject(f) && isString(f.type) && MASK_TYPES.includes(f.type) && isString(f.value))
      );
    case 'RESTORE':
      return isString(msg.site) && SITES.includes(msg.site) && isChatId(msg.chatId) && isStringArray(msg.tokens);
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
    case 'CLEAR_VAULT':
    case 'GET_STATS':
      return true;
    default:
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
