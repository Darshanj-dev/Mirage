// The encrypted vault (docs/schema.md, Vault). Service worker only: nothing else may import this.
//
// - AES-GCM, 256-bit key, created once, non-extractable, kept in IndexedDB.
// - A fresh random 12-byte IV on every write.
// - The storage key (e.g. vault:chatgpt:abc123) is the additional authenticated data,
//   so a record copied under another chat's key fails to decrypt.

import { browser } from 'wxt/browser';
import type { Site } from './settings';
import { assignTokens, emptyTokenState, lookupTokens, type TokenRequest, type VaultEntry } from './tokenizer';

export interface VaultRecord {
  v: 1;
  site: Site;
  chatId: string;
  createdAt: number;
  lastUsedAt: number;
  counters: Partial<Record<string, number>>; // next number per placeholder label
  entries: VaultEntry[];
}

export interface EncryptedBlob {
  v: 1;
  iv: string; // base64, 12 random bytes
  ct: string; // base64 ciphertext
}

export type VaultIndex = Record<string, { lastUsedAt: number }>;

export const VAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const INDEX_KEY = 'vaultIndex';
const ALWAYS_MASK_KEY = 'alwaysMask';

// ---------------------------------------------------------------- key

const DB_NAME = 'mirage-keys';
const STORE = 'keys';
const KEY_ID = 'vaultKey';

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open key store'));
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Key store request failed'));
  });
}

async function loadOrCreateKey(): Promise<CryptoKey> {
  const db = await openKeyDb();
  try {
    const existing = await idbRequest(db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY_ID));
    if (existing instanceof CryptoKey) return existing;

    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    // add() fails if another context created the key first; then use that one.
    try {
      await idbRequest(db.transaction(STORE, 'readwrite').objectStore(STORE).add(key, KEY_ID));
      return key;
    } catch {
      const winner = await idbRequest(db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY_ID));
      if (winner instanceof CryptoKey) return winner;
      throw new Error('Could not store the vault key');
    }
  } finally {
    db.close();
  }
}

let keyPromise: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  keyPromise ??= loadOrCreateKey().catch((err: unknown) => {
    keyPromise = null;
    throw err;
  });
  return keyPromise;
}

/** Test hook: forget the cached key (e.g. after the fake IndexedDB is reset). */
export function resetKeyCacheForTests(): void {
  keyPromise = null;
}

// ---------------------------------------------------------------- encryption

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const encoder = new TextEncoder();

export async function encryptJson(storageKey: string, value: unknown): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(storageKey) },
    await getKey(),
    encoder.encode(JSON.stringify(value)),
  );
  return { v: 1, iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
}

/** Throws if the blob was tampered with, stored under a different key, or the vault key changed. */
export async function decryptJson(storageKey: string, blob: EncryptedBlob): Promise<unknown> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(blob.iv), additionalData: encoder.encode(storageKey) },
    await getKey(),
    fromBase64(blob.ct),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

const isBlob = (value: unknown): value is EncryptedBlob =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as EncryptedBlob).iv === 'string' &&
  typeof (value as EncryptedBlob).ct === 'string';

// ---------------------------------------------------------------- one write at a time per key

const locks = new Map<string, Promise<unknown>>();

/** Runs `task` after any earlier task on the same key, so read-modify-write never interleaves. */
function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  const settled = run.catch(() => undefined);
  locks.set(key, settled);
  void settled.then(() => {
    if (locks.get(key) === settled) locks.delete(key);
  });
  return run;
}

// ---------------------------------------------------------------- records

export const vaultStorageKey = (site: Site, chatId: string): string => `vault:${site}:${chatId}`;

async function loadIndex(): Promise<VaultIndex> {
  const { [INDEX_KEY]: index } = await browser.storage.local.get(INDEX_KEY);
  return typeof index === 'object' && index !== null ? (index as VaultIndex) : {};
}

/** The decrypted record, or null if there is none or it can no longer be decrypted. */
export async function loadRecord(site: Site, chatId: string): Promise<VaultRecord | null> {
  const key = vaultStorageKey(site, chatId);
  const { [key]: stored } = await browser.storage.local.get(key);
  if (!isBlob(stored)) return null;
  try {
    return (await decryptJson(key, stored)) as VaultRecord;
  } catch {
    return null;
  }
}

async function saveRecord(record: VaultRecord): Promise<void> {
  const key = vaultStorageKey(record.site, record.chatId);
  const index = await loadIndex();
  index[key] = { lastUsedAt: record.lastUsedAt };
  await browser.storage.local.set({ [key]: await encryptJson(key, record), [INDEX_KEY]: index });
}

/**
 * Placeholders for the given personal details in one chat, saved to the vault.
 * The same normalized value always gets the same placeholder within a chat.
 */
export function tokenize(
  site: Site,
  chatId: string,
  requests: readonly TokenRequest[],
  now: number = Date.now(),
): Promise<string[]> {
  const key = vaultStorageKey(site, chatId);
  return withLock(key, async () => {
    // An unreadable record (vault key lost) is replaced: placeholders renumber, nothing leaks.
    const record: VaultRecord = (await loadRecord(site, chatId)) ?? {
      v: 1,
      site,
      chatId,
      createdAt: now,
      lastUsedAt: now,
      ...emptyTokenState(),
    };
    const result = assignTokens(record, requests, now);
    await saveRecord({ ...record, ...result.state, lastUsedAt: now });
    return result.tokens;
  });
}

/** Real values for the placeholders found in a reply; unknown ones are left out. */
export async function restore(site: Site, chatId: string, tokens: readonly string[]): Promise<Record<string, string>> {
  const record = await loadRecord(site, chatId);
  return record ? lookupTokens(record, tokens) : {};
}

/** Moves a new chat's record from its temporary id to the real id once the URL has one. */
export function renameChat(site: Site, fromChatId: string, toChatId: string, now: number = Date.now()): Promise<boolean> {
  const fromKey = vaultStorageKey(site, fromChatId);
  const toKey = vaultStorageKey(site, toChatId);
  return withLock(fromKey, () =>
    withLock(toKey, async () => {
      const record = await loadRecord(site, fromChatId);
      if (!record || (await loadRecord(site, toChatId))) return false;
      await saveRecord({ ...record, chatId: toChatId, lastUsedAt: now });
      await removeKeys([fromKey]);
      return true;
    }),
  );
}

async function removeKeys(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  const index = await loadIndex();
  for (const key of keys) delete index[key];
  await browser.storage.local.remove([...keys]);
  await browser.storage.local.set({ [INDEX_KEY]: index });
}

/** All vault record keys: the index plus any stray vault:* keys it missed. */
async function allRecordKeys(): Promise<string[]> {
  const everything = await browser.storage.local.get(null);
  const keys = new Set(Object.keys(await loadIndex()));
  for (const key of Object.keys(everything)) if (key.startsWith('vault:')) keys.add(key);
  return [...keys];
}

/** Removes every record. Returns the number of placeholder pairs cleared. */
export async function clearVault(): Promise<number> {
  const keys = await allRecordKeys();
  let pairs = 0;
  for (const key of keys) {
    const [, site, ...rest] = key.split(':');
    const record = await loadRecord(site as Site, rest.join(':'));
    pairs += record?.entries.length ?? 0;
  }
  await removeKeys(keys);
  await browser.storage.local.remove(INDEX_KEY);
  return pairs;
}

/** Removes records not used for `maxAgeMs` (24 hours), without decrypting anything. */
export async function sweepVault(now: number = Date.now(), maxAgeMs: number = VAULT_MAX_AGE_MS): Promise<number> {
  const index = await loadIndex();
  const stale = Object.entries(index)
    .filter(([, { lastUsedAt }]) => now - lastUsedAt >= maxAgeMs)
    .map(([key]) => key);
  await removeKeys(stale);
  return stale.length;
}

// ---------------------------------------------------------------- Always mask list (encrypted)

export async function loadAlwaysMask(): Promise<string[]> {
  const { [ALWAYS_MASK_KEY]: stored } = await browser.storage.local.get(ALWAYS_MASK_KEY);
  if (!isBlob(stored)) return [];
  try {
    const value = (await decryptJson(ALWAYS_MASK_KEY, stored)) as { terms?: unknown };
    return Array.isArray(value.terms) ? value.terms.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export async function saveAlwaysMask(terms: readonly string[]): Promise<string[]> {
  const clean = [...new Set(terms.map((t) => t.trim().replace(/\s+/g, ' ')).filter(Boolean))];
  await browser.storage.local.set({ [ALWAYS_MASK_KEY]: await encryptJson(ALWAYS_MASK_KEY, { v: 1, terms: clean }) });
  return clean;
}
