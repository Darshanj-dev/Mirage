// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SITES } from '../sites';
import { installSendGuard, type SendGuard } from './sendGuard';

function visible(el: Element): void {
  el.getClientRects = () => [{ width: 600, height: 20 }] as unknown as DOMRectList;
  el.getBoundingClientRect = () => ({ width: 600, height: 20, top: 0, left: 0, right: 600, bottom: 20, x: 0, y: 0, toJSON: () => ({}) });
}

let guard: SendGuard;
let pageSends: number;
let listeners: AbortController;

beforeEach(() => {
  document.body.innerHTML = `
    <div data-message-author-role="user"><textarea id="edit">old prompt</textarea>
      <button id="edit-cancel">Cancel</button><button id="edit-send">Send</button></div>
    <form id="composer" data-mobile-composer><textarea id="mobile-composer-prompt" name="prompt">my PAN is ABCDE1234F</textarea>
      <button id="send" type="submit" data-composer-submit aria-label="Send message"></button></form>
    <button id="other">Share</button>`;
  visible(document.querySelector('#mobile-composer-prompt')!);
  pageSends = 0;
  // The page's own send handlers (bubble phase): count what reaches them.
  document.querySelector('#send')!.addEventListener('click', () => pageSends++);
  document.querySelector('#edit-send')!.addEventListener('click', () => pageSends++);
  document.querySelector('#composer')!.addEventListener('submit', (e) => {
    e.preventDefault();
    pageSends++;
  });
  listeners = new AbortController();
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' && !e.defaultPrevented) pageSends++;
    },
    { signal: listeners.signal },
  );
  guard = installSendGuard(SITES.chatgpt);
});

afterEach(() => {
  guard.dispose();
  listeners.abort();
});

const enter = (el: Element) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

describe('send guard', () => {
  it('stops Enter in the prompt box and hands the box to MIRAGE', () => {
    const handler = vi.fn();
    guard.setHandler(handler);
    enter(document.querySelector('#mobile-composer-prompt')!);
    expect(handler).toHaveBeenCalledWith(document.querySelector('#mobile-composer-prompt'));
    expect(pageSends).toBe(0);
  });

  it('lets Shift+Enter (a new line) through', () => {
    const handler = vi.fn();
    guard.setHandler(handler);
    document
      .querySelector('#mobile-composer-prompt')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('stops a click on the send button and the form submit', () => {
    const handler = vi.fn();
    guard.setHandler(handler);
    (document.querySelector('#send') as HTMLButtonElement).click();
    document.querySelector('#composer')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(handler).toHaveBeenCalledTimes(2);
    expect(pageSends).toBe(0);
  });

  it('stops even with no handler yet (fail closed while the UI loads)', () => {
    enter(document.querySelector('#mobile-composer-prompt')!);
    expect(pageSends).toBe(0);
  });

  it('lets everything through when MIRAGE is off here', () => {
    guard.setPassThrough(() => true);
    (document.querySelector('#send') as HTMLButtonElement).click();
    expect(pageSends).toBeGreaterThan(0);
  });

  it('stops if the off-check itself throws', () => {
    guard.setPassThrough(() => {
      throw new Error('context invalidated');
    });
    (document.querySelector('#send') as HTMLButtonElement).click();
    expect(pageSends).toBe(0);
  });

  it('sendNow presses the real send button and lets exactly that send through', async () => {
    const handler = vi.fn();
    guard.setHandler(handler);
    expect(await guard.sendNow(document.querySelector('#mobile-composer-prompt')!)).toBe(true);
    expect(pageSends).toBe(2); // the page saw the click and the form submit it causes
    expect(handler).not.toHaveBeenCalled();
  });

  it('guards the edit-message box: Enter and its Send button', () => {
    const handler = vi.fn();
    guard.setHandler(handler);
    enter(document.querySelector('#edit')!);
    (document.querySelector('#edit-send') as HTMLButtonElement).click();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[1]![0]).toBe(document.querySelector('#edit'));
    expect(pageSends).toBe(0);
  });

  it('re-presses the edit box’s own Send button after checking', async () => {
    guard.setHandler(() => {});
    (document.querySelector('#edit-send') as HTMLButtonElement).click();
    expect(await guard.sendNow(document.querySelector('#edit')!)).toBe(true);
    expect(pageSends).toBe(1);
  });

  it('lets the user’s own event through when the prompt is clean', () => {
    const handler = vi.fn();
    guard.setHandler(handler);
    guard.setIsClean(() => true);
    enter(document.querySelector('#mobile-composer-prompt')!);
    expect(handler).not.toHaveBeenCalled();
    expect(pageSends).toBe(1);
  });

  it('stops the send if the clean check throws', () => {
    guard.setIsClean(() => {
      throw new Error('detector failed');
    });
    enter(document.querySelector('#mobile-composer-prompt')!);
    expect(pageSends).toBe(0);
  });

  it('leaves other buttons alone', () => {
    const handler = vi.fn();
    guard.setHandler(handler);
    (document.querySelector('#other') as HTMLButtonElement).click();
    (document.querySelector('#edit-cancel') as HTMLButtonElement).click();
    expect(handler).not.toHaveBeenCalled();
  });

  it('stops nothing once disposed', () => {
    guard.dispose();
    (document.querySelector('#send') as HTMLButtonElement).click();
    expect(pageSends).toBeGreaterThan(0);
  });
});
