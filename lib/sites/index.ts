// MIRAGE core for page structure: finds the prompt box, the send button and the conversation
// on any supported site from that site's adapter. Every chatbot selector lives in lib/sites/.
//
// Selectors break when a site redesigns (signed-out ChatGPT moved from a rich editor to a
// <textarea> in 2026). So if no selector matches, findPromptBox falls back to the visible
// editable box that looks like a composer, and the badge reports "limited" protection.

import { chatgpt } from './chatgpt';
import { claude } from './claude';
import { copilot } from './copilot';
import { gemini } from './gemini';
import type { Site } from './hosts';
import { perplexity } from './perplexity';
import type { SiteConfig } from './types';

export type { Site } from './hosts';
export type { SiteConfig } from './types';

export const SITES: Record<Site, SiteConfig> = { chatgpt, gemini, claude, copilot, perplexity };

export function siteForHost(host: string): SiteConfig | null {
  return Object.values(SITES).find((s) => s.hosts.includes(host)) ?? null;
}

const isVisible = (el: Element): boolean => el.getClientRects().length > 0;

/** A text box a user can type a prompt into. */
function isEditableBox(el: Element): el is HTMLElement {
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  return el instanceof HTMLElement && el.isContentEditable && el.getAttribute('contenteditable') !== 'false';
}

const EDITABLES = 'textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]';

function first(root: ParentNode, selectors: readonly string[], ok: (el: Element) => boolean = isVisible): HTMLElement | null {
  for (const selector of selectors) {
    try {
      for (const el of root.querySelectorAll(selector)) if (el instanceof HTMLElement && ok(el)) return el;
    } catch {
      // A selector this browser can't parse (e.g. :has on an old engine): try the next one.
    }
  }
  return null;
}

/** True when `el` sits inside a message of the conversation (not the composer). */
export function inConversation(site: SiteConfig, el: Element): boolean {
  return site.conversation.some((selector) => {
    try {
      return !!el.closest(selector);
    } catch {
      return false;
    }
  });
}

/**
 * The composer when no adapter selector matched: the focused editable box if it is not inside a
 * message, else the widest visible one. MIRAGE's own UI and Quill's hidden clipboard are skipped.
 */
function fallbackPromptBox(site: SiteConfig, root: ParentNode): HTMLElement | null {
  const candidates = [...root.querySelectorAll(EDITABLES)].filter(
    (el): el is HTMLElement =>
      isEditableBox(el) &&
      isVisible(el) &&
      !el.closest('mirage-ui, mirage-copy') &&
      !el.classList.contains('ql-clipboard') &&
      !inConversation(site, el) &&
      el.getBoundingClientRect().width >= 160,
  );
  if (candidates.length === 0) return null;
  const active = document.activeElement;
  const focused = candidates.find((el) => el === active || el.contains(active));
  if (focused) return focused;
  return candidates.reduce((best, el) => (el.getBoundingClientRect().width > best.getBoundingClientRect().width ? el : best));
}

export interface PromptBoxMatch {
  box: HTMLElement;
  /** True when the adapter's selectors missed and the fallback found it. */
  fallback: boolean;
}

export function locatePromptBox(site: SiteConfig, root: ParentNode = document): PromptBoxMatch | null {
  const box = first(root, site.promptBox);
  if (box) return { box, fallback: false };
  const guess = fallbackPromptBox(site, root);
  return guess ? { box: guess, fallback: true } : null;
}

export function findPromptBox(site: SiteConfig, root: ParentNode = document): HTMLElement | null {
  return locatePromptBox(site, root)?.box ?? null;
}

/**
 * An "edit message" box: an editable box inside an earlier message. Editing and re-sending a
 * message is a second way a prompt leaves the page, so it gets the same checks.
 */
export function editBoxFor(site: SiteConfig, target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest(EDITABLES);
  return el && isEditableBox(el) && inConversation(site, el) ? el : null;
}

const SEND_WORDS = /^(?:send|submit|save|update|save & submit|send message|submit message)$/i;

/** A send button, not the stop button that takes its place while a reply streams. */
export function isSendButton(site: SiteConfig, el: Element): el is HTMLButtonElement {
  if (!(el instanceof HTMLButtonElement)) return false;
  if (!site.sendButton.some((selector) => el.matches(selector))) return false;
  const label = `${el.dataset.testid ?? ''} ${el.getAttribute('aria-label') ?? ''}`.toLowerCase();
  return !label.includes('stop');
}

/** A button that sends or saves an edited message: "Send", "Save", "Submit". */
function isEditSendButton(el: Element): el is HTMLButtonElement {
  if (!(el instanceof HTMLButtonElement) || el.disabled) return false;
  const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
  return SEND_WORDS.test(label);
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

/** The message container around an edit box, where its Send/Save button lives. */
function messageOf(site: SiteConfig, el: Element): Element | null {
  for (const selector of site.conversation) {
    try {
      const m = el.closest(selector);
      if (m) return m.parentElement ?? m;
    } catch {
      // unparsable selector: try the next one
    }
  }
  return null;
}

/**
 * A click on the Send/Save button of an edit box, with that box. Only counts when the box
 * in the same message has text, so ordinary buttons in the conversation are never stopped.
 */
export function editSendFromEvent(site: SiteConfig, target: EventTarget | null): { button: HTMLButtonElement; box: HTMLElement } | null {
  if (!(target instanceof Element)) return null;
  const button = target.closest('button');
  if (!button || !isEditSendButton(button) || !inConversation(site, button)) return null;
  const message = messageOf(site, button);
  const box = message ? [...message.querySelectorAll(EDITABLES)].find((el): el is HTMLElement => isEditableBox(el)) : undefined;
  return box ? { button, box } : null;
}

/** The Send/Save button that belongs to an edit box. */
export function findEditSendButton(site: SiteConfig, box: HTMLElement): HTMLButtonElement | null {
  const message = messageOf(site, box);
  if (!message) return null;
  return [...message.querySelectorAll('button')].find(isEditSendButton) ?? null;
}

export function findComposer(site: SiteConfig, box: HTMLElement): HTMLElement {
  for (const selector of site.composer) {
    const el = box.closest<HTMLElement>(selector);
    if (el) return el;
  }
  // No wrapper known: the nearest ancestor that also holds a send button.
  let el: HTMLElement | null = box.parentElement;
  for (let depth = 0; el && depth < 8; depth++, el = el.parentElement) {
    if (site.sendButton.some((selector) => el!.querySelector(selector))) return el;
  }
  return box;
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

/** Reply text containers on the page, for the reply check. */
export function findReplies(site: SiteConfig, root: ParentNode = document): HTMLElement[] {
  const out = new Set<HTMLElement>();
  for (const selector of site.replyContent) {
    try {
      for (const el of root.querySelectorAll(selector)) {
        // Keep the outermost match only, so one reply is never read twice.
        if (el instanceof HTMLElement && ![...out].some((o) => o.contains(el))) out.add(el);
      }
    } catch {
      // unparsable selector: try the next one
    }
  }
  return [...out];
}
