// Every chatbot page selector lives here, so a site redesign is a one-file fix.
// ChatGPT selectors taken from chatgpt.com via DevTools on 2026-09-28.

import type { Site } from './settings';

export interface SiteConfig {
  id: Site;
  name: string; // shown to the user, e.g. "ChatGPT will see this"
  host: string;
  /** Tried in order; the first visible match is the prompt box. */
  promptBox: readonly string[];
  /** Tried in order, first inside the composer, then in the whole page. */
  sendButton: readonly string[];
  /** The element that wraps the prompt box and its buttons. */
  composer: readonly string[];
  /** Conversation id from the URL path, or null for a new, unsaved chat. */
  chatIdFromPath(path: string): string | null;
  /** False until selectors for this site have been checked by hand. */
  ready: boolean;
}

export const SITES: Record<Site, SiteConfig> = {
  chatgpt: {
    id: 'chatgpt',
    name: 'ChatGPT',
    host: 'chatgpt.com',
    promptBox: ['#prompt-textarea[contenteditable="true"]', 'form .ProseMirror[contenteditable="true"]'],
    // While a reply streams, #composer-submit-button becomes the stop button; isSendButton() skips it.
    sendButton: ['button[data-testid="send-button"]', '#composer-submit-button'],
    composer: ['form'],
    // /c/<uuid>, or /g/<gpt>/c/<uuid> inside a custom GPT. Only a full conversation UUID counts:
    // right after the first send ChatGPT briefly shows /c/WEB:<client id>, which is not the chat's id.
    chatIdFromPath: (path) =>
      /\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![0-9a-z:-])/i.exec(path)?.[1]?.toLowerCase() ??
      null,
    ready: true,
  },
  // Gemini selectors taken from gemini.google.com via DevTools on 2026-09-28. The prompt box is a
  // Quill editor inside <rich-textarea>; Quill also keeps a hidden .ql-clipboard editable, never used.
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    host: 'gemini.google.com',
    promptBox: ['rich-textarea .ql-editor[contenteditable="true"]', '.ql-editor.new-input-ui[contenteditable="true"]'],
    // While a reply streams the button becomes "Stop response"; isSendButton() skips it.
    sendButton: ['button[aria-label="Send message"]', 'button.send-button'],
    composer: ['.input-area-container', 'input-area-v2', 'fieldset', '.text-input-field', 'rich-textarea'],
    // /app/<16 hex>, also under /u/<n>/app/<id> for a second Google account. New chats are /app.
    chatIdFromPath: (path) => /\/app\/([0-9a-f]{12,})(?![0-9a-z:_-])/i.exec(path)?.[1]?.toLowerCase() ?? null,
    ready: true,
  },
};

export function siteForHost(host: string): SiteConfig | null {
  return Object.values(SITES).find((s) => host === s.host || host.endsWith(`.${s.host}`)) ?? null;
}

const isVisible = (el: HTMLElement): boolean => el.getClientRects().length > 0;

export function findPromptBox(site: SiteConfig, root: ParentNode = document): HTMLElement | null {
  for (const selector of site.promptBox) {
    for (const el of root.querySelectorAll<HTMLElement>(selector)) if (isVisible(el)) return el;
  }
  return null;
}

export function findComposer(site: SiteConfig, box: HTMLElement): HTMLElement {
  for (const selector of site.composer) {
    const el = box.closest<HTMLElement>(selector);
    if (el) return el;
  }
  return box;
}

/** A send button, not the stop button that takes its place while a reply streams. */
export function isSendButton(site: SiteConfig, el: Element): el is HTMLButtonElement {
  if (!(el instanceof HTMLButtonElement)) return false;
  if (!site.sendButton.some((selector) => el.matches(selector))) return false;
  const label = `${el.dataset.testid ?? ''} ${el.getAttribute('aria-label') ?? ''}`.toLowerCase();
  return !label.includes('stop');
}

/** The send button a click landed on, if any. */
export function sendButtonFromEvent(site: SiteConfig, target: EventTarget | null): HTMLButtonElement | null {
  if (!(target instanceof Element)) return null;
  for (const selector of site.sendButton) {
    const el = target.closest(selector);
    if (el && isSendButton(site, el)) return el;
  }
  return null;
}

export function findSendButton(site: SiteConfig, box: HTMLElement): HTMLButtonElement | null {
  const composer = findComposer(site, box);
  for (const root of [composer, document]) {
    for (const selector of site.sendButton) {
      for (const el of root.querySelectorAll(selector)) if (isSendButton(site, el)) return el;
    }
  }
  return null;
}
