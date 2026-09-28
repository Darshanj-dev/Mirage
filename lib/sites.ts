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
    sendButton: ['#composer-submit-button', 'button[data-testid="send-button"]'],
    composer: ['form'],
    // /c/<id>, or /g/<gpt>/c/<id> inside a custom GPT
    chatIdFromPath: (path) => /\/c\/([A-Za-z0-9-]+)/.exec(path)?.[1] ?? null,
    ready: true,
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    host: 'gemini.google.com',
    promptBox: [], // M5: selectors to be taken from gemini.google.com
    sendButton: [],
    composer: [],
    chatIdFromPath: (path) => /\/app\/([A-Za-z0-9]+)/.exec(path)?.[1] ?? null,
    ready: false,
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

export function findSendButton(site: SiteConfig, box: HTMLElement): HTMLButtonElement | null {
  const composer = findComposer(site, box);
  for (const root of [composer, document]) {
    for (const selector of site.sendButton) {
      const el = root.querySelector<HTMLButtonElement>(selector);
      if (el) return el;
    }
  }
  return null;
}
