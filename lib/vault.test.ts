import { describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import {
  VAULT_MAX_AGE_MS,
  clearVault,
  decryptJson,
  encryptJson,
  loadAlwaysMask,
  loadRecord,
  renameChat,
  resetKeyCacheForTests,
  restore,
  saveAlwaysMask,
  sweepVault,
  tokenize,
  vaultStorageKey,
} from './vault';

const rawStorage = async (): Promise<string> => JSON.stringify(await browser.storage.local.get(null));

describe('vault encryption', () => {
  it('round-trips a value', async () => {
    const blob = await encryptJson('vault:chatgpt:a', { hello: 'world' });
    expect(await decryptJson('vault:chatgpt:a', blob)).toEqual({ hello: 'world' });
  });

  it('uses a fresh 12-byte IV on every write', async () => {
    const a = await encryptJson('k', { x: 1 });
    const b = await encryptJson('k', { x: 1 });
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
    expect(atob(a.iv)).toHaveLength(12);
  });

  it('fails to decrypt a record moved under another storage key', async () => {
    const blob = await encryptJson('vault:chatgpt:chat-1', { secret: 1 });
    await expect(decryptJson('vault:chatgpt:chat-2', blob)).rejects.toThrow();
  });

  it('fails to decrypt a tampered record', async () => {
    const blob = await encryptJson('k', { value: 'ABCDE1234F' });
    const bytes = Uint8Array.from(atob(blob.ct), (c) => c.charCodeAt(0));
    bytes[0] = bytes[0]! ^ 1;
    await expect(decryptJson('k', { ...blob, ct: btoa(String.fromCharCode(...bytes)) })).rejects.toThrow();
  });

  it('keeps the key non-extractable and reuses it across restarts', async () => {
    const blob = await encryptJson('k', { n: 1 });
    resetKeyCacheForTests(); // like a service worker restart: the key is reloaded from IndexedDB
    expect(await decryptJson('k', blob)).toEqual({ n: 1 });

    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('mirage-keys', 1);
      req.onsuccess = () => resolve(req.result);
    });
    const key = await new Promise<CryptoKey>((resolve) => {
      const req = db.transaction('keys').objectStore('keys').get('vaultKey');
      req.onsuccess = () => resolve(req.result as CryptoKey);
    });
    db.close();
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });
});

describe('vault records', () => {
  it('tokenizes then restores the real values', async () => {
    const tokens = await tokenize('chatgpt', 'chat-1', [
      { type: 'PAN', value: 'ABCDE1234F' },
      { type: 'PHONE', value: '98450 12345' },
    ]);
    expect(tokens).toEqual(['«PAN_1»', '«PHONE_1»']);
    expect(await restore('chatgpt', 'chat-1', ['«PAN_1»', '«PHONE_1»', '«EMAIL_1»'])).toEqual({
      '«PAN_1»': 'ABCDE1234F',
      '«PHONE_1»': '98450 12345',
    });
  });

  it('never stores a value as plain text', async () => {
    await tokenize('chatgpt', 'chat-1', [{ type: 'PAN', value: 'ABCDE1234F' }]);
    await saveAlwaysMask(['Priya Nair']);
    const raw = await rawStorage();
    expect(raw).not.toContain('ABCDE1234F');
    expect(raw).not.toContain('Priya');
    expect(raw).toContain(vaultStorageKey('chatgpt', 'chat-1'));
  });

  it('reuses placeholders across sends in the same chat', async () => {
    await tokenize('chatgpt', 'chat-1', [{ type: 'PAN', value: 'ABCDE1234F' }]);
    const second = await tokenize('chatgpt', 'chat-1', [
      { type: 'PAN', value: 'BNZPM2501K' },
      { type: 'PAN', value: 'abcde1234f' },
    ]);
    expect(second).toEqual(['«PAN_2»', '«PAN_1»']);
  });

  it('keeps chats and sites separate', async () => {
    await tokenize('chatgpt', 'chat-1', [{ type: 'PAN', value: 'ABCDE1234F' }]);
    expect(await tokenize('chatgpt', 'chat-2', [{ type: 'PAN', value: 'BNZPM2501K' }])).toEqual(['«PAN_1»']);
    expect(await restore('gemini', 'chat-1', ['«PAN_1»'])).toEqual({});
    expect(await restore('chatgpt', 'chat-2', ['«PAN_1»'])).toEqual({ '«PAN_1»': 'BNZPM2501K' });
  });

  it('handles concurrent sends to one chat without losing entries', async () => {
    const results = await Promise.all([
      tokenize('chatgpt', 'c', [{ type: 'PAN', value: 'ABCDE1234F' }]),
      tokenize('chatgpt', 'c', [{ type: 'PAN', value: 'BNZPM2501K' }]),
      tokenize('chatgpt', 'c', [{ type: 'PAN', value: 'ABCDE1234F' }]),
    ]);
    expect(results).toEqual([['«PAN_1»'], ['«PAN_2»'], ['«PAN_1»']]);
    expect((await loadRecord('chatgpt', 'c'))?.entries).toHaveLength(2);
  });

  it('treats a record copied under another chat key as unreadable', async () => {
    await tokenize('chatgpt', 'chat-1', [{ type: 'PAN', value: 'ABCDE1234F' }]);
    const key1 = vaultStorageKey('chatgpt', 'chat-1');
    const { [key1]: blob } = await browser.storage.local.get(key1);
    await browser.storage.local.set({ [vaultStorageKey('chatgpt', 'chat-2')]: blob });
    expect(await loadRecord('chatgpt', 'chat-2')).toBeNull();
    expect(await restore('chatgpt', 'chat-2', ['«PAN_1»'])).toEqual({});
  });

  it('renames a new chat from its temporary id', async () => {
    await tokenize('chatgpt', 'tmp-1', [{ type: 'PAN', value: 'ABCDE1234F' }]);
    expect(await renameChat('chatgpt', 'tmp-1', 'real-id')).toBe(true);
    expect(await restore('chatgpt', 'real-id', ['«PAN_1»'])).toEqual({ '«PAN_1»': 'ABCDE1234F' });
    expect(await loadRecord('chatgpt', 'tmp-1')).toBeNull();
    expect(await renameChat('chatgpt', 'missing', 'x')).toBe(false);
  });

  it('clears everything and reports the number of pairs', async () => {
    await tokenize('chatgpt', 'a', [
      { type: 'PAN', value: 'ABCDE1234F' },
      { type: 'PHONE', value: '9845012345' },
    ]);
    await tokenize('gemini', 'b', [{ type: 'EMAIL', value: 'a.b@example.com' }]);
    expect(await clearVault()).toBe(3);
    expect(await restore('chatgpt', 'a', ['«PAN_1»'])).toEqual({});
    expect(Object.keys(await browser.storage.local.get(null)).filter((k) => k.startsWith('vault'))).toEqual([]);
  });
});

describe('vault sweep', () => {
  it('removes chats unused for 24 hours and keeps recent ones', async () => {
    const now = 1_800_000_000_000;
    await tokenize('chatgpt', 'old', [{ type: 'PAN', value: 'ABCDE1234F' }], now - VAULT_MAX_AGE_MS - 1);
    await tokenize('chatgpt', 'fresh', [{ type: 'PAN', value: 'BNZPM2501K' }], now - 60_000);

    expect(await sweepVault(now)).toBe(1);
    expect(await restore('chatgpt', 'old', ['«PAN_1»'])).toEqual({});
    expect(await restore('chatgpt', 'fresh', ['«PAN_1»'])).toEqual({ '«PAN_1»': 'BNZPM2501K' });
  });

  it('counts a new send as use, so an active chat is kept', async () => {
    const now = 1_800_000_000_000;
    await tokenize('chatgpt', 'c', [{ type: 'PAN', value: 'ABCDE1234F' }], now - VAULT_MAX_AGE_MS - 1);
    await tokenize('chatgpt', 'c', [{ type: 'PHONE', value: '9845012345' }], now - 1000);
    expect(await sweepVault(now)).toBe(0);
  });
});

describe('Always mask list', () => {
  it('saves encrypted, trims, and removes duplicates and blanks', async () => {
    expect(await saveAlwaysMask([' Priya  Nair ', 'Priya Nair', '', 'Acme'])).toEqual(['Priya Nair', 'Acme']);
    expect(await loadAlwaysMask()).toEqual(['Priya Nair', 'Acme']);
  });

  it('is empty when nothing is saved', async () => {
    expect(await loadAlwaysMask()).toEqual([]);
  });
});
