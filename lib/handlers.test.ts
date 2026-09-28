import { describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { handleMessage } from './handlers';

describe('service worker messages', () => {
  it('rejects unknown or malformed messages', async () => {
    expect(await handleMessage(null)).toEqual({ ok: false, error: 'Unknown message' });
    expect(await handleMessage({ type: 'DROP_TABLES' })).toMatchObject({ ok: false });
    expect(await handleMessage({ type: 'TOKENIZE', site: 'claude', chatId: 'x', findings: [] })).toMatchObject({
      ok: false,
    });
  });

  it('refuses to tokenize a secret', async () => {
    const res = await handleMessage({
      type: 'TOKENIZE',
      site: 'chatgpt',
      chatId: 'c',
      findings: [{ type: 'API_KEY', value: 'sk-proj-Xq7Lm2Rt9Vb4Nc8Kd1Pf6Hs3Wz5Jy0Ag' }],
    });
    expect(res.ok).toBe(false);
    expect(JSON.stringify(await browser.storage.local.get(null))).not.toContain('sk-proj');
  });

  it('TOKENIZE then RESTORE', async () => {
    const tok = await handleMessage({
      type: 'TOKENIZE',
      site: 'chatgpt',
      chatId: 'c',
      findings: [{ type: 'PAN', value: 'ABCDE1234F' }],
    });
    expect(tok).toEqual({ ok: true, tokens: ['«PAN_1»'] });
    const res = await handleMessage({ type: 'RESTORE', site: 'chatgpt', chatId: 'c', tokens: ['«PAN_1»', '«PAN_2»'] });
    expect(res).toEqual({ ok: true, values: { '«PAN_1»': 'ABCDE1234F' } });
  });

  it('PREVIEW shows the next placeholders without saving', async () => {
    await handleMessage({ type: 'TOKENIZE', site: 'chatgpt', chatId: 'c', findings: [{ type: 'PAN', value: 'ABCDE1234F' }] });
    const preview = await handleMessage({
      type: 'PREVIEW',
      site: 'chatgpt',
      chatId: 'c',
      findings: [
        { type: 'PAN', value: 'BNZPM2501K' },
        { type: 'PAN', value: 'ABCDE1234F' },
      ],
    });
    expect(preview).toEqual({ ok: true, tokens: ['«PAN_2»', '«PAN_1»'] });
    expect(await handleMessage({ type: 'RESTORE', site: 'chatgpt', chatId: 'c', tokens: ['«PAN_2»'] })).toEqual({
      ok: true,
      values: {},
    });
    expect(JSON.stringify(await browser.storage.local.get(null))).not.toContain('BNZPM2501K');
  });

  it('PREVIEW rejects secrets too', async () => {
    const res = await handleMessage({ type: 'PREVIEW', site: 'chatgpt', chatId: 'c', findings: [{ type: 'OTP', value: '1234' }] });
    expect(res.ok).toBe(false);
  });

  it('RENAME_CHAT moves a temporary chat', async () => {
    await handleMessage({ type: 'TOKENIZE', site: 'gemini', chatId: 'tmp', findings: [{ type: 'PAN', value: 'ABCDE1234F' }] });
    expect(await handleMessage({ type: 'RENAME_CHAT', site: 'gemini', fromChatId: 'tmp', toChatId: 'abc' })).toEqual({
      ok: true,
      renamed: true,
    });
  });

  it('GET_SETTINGS and SET_SETTINGS, with the Always mask list encrypted', async () => {
    const initial = await handleMessage({ type: 'GET_SETTINGS' });
    expect(initial).toMatchObject({ ok: true, settings: { enabled: true }, alwaysMask: [] });

    const updated = await handleMessage({
      type: 'SET_SETTINGS',
      settings: { quickMode: true, safeWords: ['Demo'] },
      alwaysMask: ['Priya Nair'],
    });
    expect(updated).toMatchObject({
      ok: true,
      settings: { quickMode: true, safeWords: ['demo'] },
      alwaysMask: ['Priya Nair'],
    });
    expect(JSON.stringify(await browser.storage.local.get(null))).not.toContain('Priya');
  });

  it('SET_SETTINGS ignores unknown fields', async () => {
    await handleMessage({ type: 'SET_SETTINGS', settings: { enabled: false, evil: 'x', v: 99 } });
    const { settings } = await browser.storage.local.get('settings');
    expect(settings).toMatchObject({ v: 1, enabled: false });
    expect(JSON.stringify(settings)).not.toContain('evil');
  });

  it('COUNT stores numbers only, and GET_STATS reads them', async () => {
    await handleMessage({
      type: 'COUNT',
      delta: { hidden: 2, blocked: 1, byType: { PAN: 2, ABCDE1234F: 1, PRIYA: 1 }, note: 'ABCDE1234F' },
    });
    const stats = await handleMessage({ type: 'GET_STATS' });
    expect(stats).toMatchObject({ ok: true, stats: { week: { hidden: 2, blocked: 1, byType: { PAN: 2 } } } });
    const raw = JSON.stringify(await browser.storage.local.get(null));
    expect(raw).not.toContain('ABCDE1234F');
    expect(raw).not.toContain('PRIYA');
  });

  it('CLEAR_VAULT reports the pairs removed', async () => {
    await handleMessage({
      type: 'TOKENIZE',
      site: 'chatgpt',
      chatId: 'c',
      findings: [
        { type: 'PAN', value: 'ABCDE1234F' },
        { type: 'EMAIL', value: 'a@example.com' },
      ],
    });
    expect(await handleMessage({ type: 'CLEAR_VAULT' })).toEqual({ ok: true, cleared: 2 });
  });
});
