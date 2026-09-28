// The new-chat flow on ChatGPT, end to end through the real message handler:
// "/" while typing -> send -> "/c/WEB:<client id>" -> "/c/<uuid>".

import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { handleMessage } from '../handlers';
import { SITES } from '../sites';
import { restore } from '../vault';
import { currentChatId, markChatIdUsed, resolveChatId } from './chatId';

const site = SITES.chatgpt;
const REAL = '6aba9e8c-f568-83ee-8d8a-8ffd93ee238f';

function goTo(pathname: string) {
  Object.defineProperty(globalThis, 'location', { value: { pathname }, configurable: true, writable: true });
}

beforeEach(() => {
  fakeBrowser.runtime.onMessage.addListener((msg: unknown) => handleMessage(msg));
});

describe('new chat id', () => {
  it('moves values from the temporary id to the real id once the URL has one', async () => {
    goTo('/');
    const temp = currentChatId(site);
    expect(temp).toMatch(/^new-/);

    const res = await handleMessage({ type: 'TOKENIZE', site: 'chatgpt', chatId: temp, findings: [{ type: 'PAN', value: 'ABCDE1234F' }] });
    expect(res.ok).toBe(true);
    markChatIdUsed(temp);

    goTo('/c/WEB:1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b');
    expect(await resolveChatId(site)).toBe(temp); // in-between URL: keep using the temporary id

    goTo(`/c/${REAL}`);
    expect(await resolveChatId(site)).toBe(REAL);
    expect((await restore('chatgpt', REAL, ['«PAN_1»'])).values).toEqual({ '«PAN_1»': 'ABCDE1234F' });
    expect((await restore('chatgpt', temp, ['«PAN_1»'])).found).toBe(false);
  });
});
