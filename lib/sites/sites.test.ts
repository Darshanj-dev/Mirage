// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { ALL_MATCHES, SITE_IDS } from './hosts';
import { SITES, editBoxFor, editSendFromEvent, findPromptBox, findSendButton, locatePromptBox, siteForHost } from './index';

// happy-dom has no layout, so every element reports a size: make visibility explicit.
function visible(el: Element, width = 600): void {
  el.getClientRects = () => [{ width, height: 20 }] as unknown as DOMRectList;
  el.getBoundingClientRect = () => ({ width, height: 20, top: 0, left: 0, right: width, bottom: 20, x: 0, y: 0, toJSON: () => ({}) });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('sites', () => {
  it('finds the site for a host', () => {
    expect(siteForHost('chatgpt.com')?.id).toBe('chatgpt');
    expect(siteForHost('gemini.google.com')?.id).toBe('gemini');
    expect(siteForHost('claude.ai')?.id).toBe('claude');
    expect(siteForHost('copilot.microsoft.com')?.id).toBe('copilot');
    expect(siteForHost('www.perplexity.ai')?.id).toBe('perplexity');
    expect(siteForHost('evilchatgpt.com')).toBeNull();
    expect(siteForHost('chatgpt.com.evil.example')).toBeNull();
  });

  it('has host permissions for every site and no others', () => {
    expect(SITE_IDS).toEqual(Object.keys(SITES));
    for (const site of Object.values(SITES)) {
      for (const host of site.hosts) expect(ALL_MATCHES).toContain(`https://${host}/*`);
    }
  });

  it('reads the ChatGPT conversation id from the URL', () => {
    const { chatIdFromPath } = SITES.chatgpt;
    expect(chatIdFromPath('/c/6aba9d4b-dda0-83ee-8efe-6b2ff8846a89')).toBe('6aba9d4b-dda0-83ee-8efe-6b2ff8846a89');
    expect(chatIdFromPath('/g/g-abc123-helper/c/6aba9d4b-dda0-83ee-8efe-6b2ff8846a89')).toBe(
      '6aba9d4b-dda0-83ee-8efe-6b2ff8846a89',
    );
    expect(chatIdFromPath('/uc/6abb61af-1d9c-83ea-8bd2-99f3913b2b3e')).toBe('6abb61af-1d9c-83ea-8bd2-99f3913b2b3e');
    expect(chatIdFromPath('/')).toBeNull();
  });

  it('ignores the in-between URL ChatGPT shows right after the first send', () => {
    const { chatIdFromPath } = SITES.chatgpt;
    expect(chatIdFromPath('/c/WEB:6aba9d4b-dda0-83ee-8efe-6b2ff8846a89')).toBeNull();
    expect(chatIdFromPath('/c/WEB')).toBeNull();
    expect(chatIdFromPath('/c/6aba9d4b-dda0')).toBeNull();
  });

  it('reads the Gemini conversation id from the URL', () => {
    const { chatIdFromPath } = SITES.gemini;
    expect(chatIdFromPath('/app/1674c799c034fd88')).toBe('1674c799c034fd88');
    expect(chatIdFromPath('/u/1/app/1674c799c034fd88')).toBe('1674c799c034fd88');
    expect(chatIdFromPath('/app')).toBeNull();
    expect(chatIdFromPath('/gem/some-gem-name')).toBeNull();
  });

  it('reads Claude, Copilot and Perplexity conversation ids', () => {
    expect(SITES.claude.chatIdFromPath('/chat/0b3c8e61-2f1a-4c55-9a51-6c0d8f2e9a10')).toBe('0b3c8e61-2f1a-4c55-9a51-6c0d8f2e9a10');
    expect(SITES.claude.chatIdFromPath('/new')).toBeNull();
    expect(SITES.copilot.chatIdFromPath('/chats/Xy12abCD34')).toBe('Xy12abCD34');
    expect(SITES.perplexity.chatIdFromPath('/search/47a9396b-ae19-40d0-a40d-f8289393a082')).toBe('47a9396b-ae19-40d0-a40d-f8289393a082');
    expect(SITES.perplexity.chatIdFromPath('/')).toBeNull();
  });
});

describe('prompt box discovery', () => {
  it('finds signed-out ChatGPT’s textarea composer and its send button', () => {
    document.body.innerHTML = `<form data-mobile-composer><textarea id="mobile-composer-prompt" name="prompt"></textarea>
      <button type="submit" data-composer-submit aria-label="Send message"></button></form>`;
    visible(document.querySelector('textarea')!);
    const match = locatePromptBox(SITES.chatgpt);
    expect(match?.box.id).toBe('mobile-composer-prompt');
    expect(match?.fallback).toBe(false);
    expect(findSendButton(SITES.chatgpt, match!.box)?.getAttribute('aria-label')).toBe('Send message');
  });

  it('skips the stop button that replaces send while a reply streams', () => {
    document.body.innerHTML = `<form><div id="prompt-textarea" contenteditable="true"></div>
      <button id="composer-submit-button" aria-label="Stop streaming"></button></form>`;
    visible(document.querySelector('#prompt-textarea')!);
    expect(findSendButton(SITES.chatgpt, findPromptBox(SITES.chatgpt)!)).toBeNull();
  });

  it('falls back to the composer-like box when every selector misses', () => {
    document.body.innerHTML = `<main><div data-message-author-role="user"><textarea id="edit"></textarea></div>
      <div class="new-composer"><textarea id="new-box"></textarea></div><input id="search"></main>`;
    for (const el of document.querySelectorAll('textarea')) visible(el);
    const match = locatePromptBox(SITES.chatgpt);
    expect(match).toEqual({ box: document.querySelector('#new-box'), fallback: true });
  });

  it('never takes a tiny or hidden box as the composer', () => {
    document.body.innerHTML = `<textarea id="tiny"></textarea><textarea id="hidden"></textarea>`;
    visible(document.querySelector('#tiny')!, 40);
    expect(findPromptBox(SITES.claude)).toBeNull();
  });

  it('finds Perplexity’s Lexical editor and its Submit button without a form', () => {
    document.body.innerHTML = `<div><div><div id="ask-input" contenteditable="true" data-lexical-editor="true"></div></div>
      <div><button aria-label="Dictation"></button><button aria-label="Submit"></button></div></div>`;
    visible(document.querySelector('#ask-input')!);
    const box = findPromptBox(SITES.perplexity)!;
    expect(box.id).toBe('ask-input');
    expect(findSendButton(SITES.perplexity, box)?.getAttribute('aria-label')).toBe('Submit');
  });
});

describe('edit message boxes', () => {
  beforeEach(() => {
    document.body.innerHTML = `<div data-message-author-role="user"><div class="bubble"><textarea id="edit">old</textarea></div>
      <div class="actions"><button id="cancel">Cancel</button><button id="send">Send</button></div></div>
      <div data-message-author-role="assistant"><button id="copy">Copy</button></div>`;
  });

  it('treats an editable box inside a message as an edit box', () => {
    expect(editBoxFor(SITES.chatgpt, document.querySelector('#edit'))?.id).toBe('edit');
    expect(editBoxFor(SITES.chatgpt, document.querySelector('#copy'))).toBeNull();
  });

  it('recognises the Send button of an edit box, and nothing else', () => {
    expect(editSendFromEvent(SITES.chatgpt, document.querySelector('#send'))?.box.id).toBe('edit');
    expect(editSendFromEvent(SITES.chatgpt, document.querySelector('#cancel'))).toBeNull();
    expect(editSendFromEvent(SITES.chatgpt, document.querySelector('#copy'))).toBeNull();
  });
});
