// "Copy with details" beside each AI reply (S5). The site's own copy button copies the reply
// as the AI wrote it, with placeholders; this one copies it with the real details put back.
//
// Each button is a small element with its own Shadow DOM, placed right after the site's copy
// button. If the site re-renders the action bar and drops it, the observer adds it back.

import type { SiteConfig } from '../sites';

const HOST_TAG = 'mirage-copy';
const FEEDBACK_MS = 1800;

const STYLE = `
:host { display: inline-flex; align-items: center; }
button {
  display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 8px;
  border: none; border-radius: 8px; background: transparent; color: inherit; opacity: 0.75;
  font: 500 13px/1 system-ui, -apple-system, 'Segoe UI', sans-serif; cursor: pointer; white-space: nowrap;
}
button:hover { opacity: 1; background: rgb(127 127 127 / 0.15); }
button:focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; }
svg { flex: none; }
`;

const ICON = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor"
  stroke-width="1.8" stroke-linejoin="round"><path d="M12 2.5 4 5.5v6c0 5 3.4 8.9 8 10 4.6-1.1 8-5 8-10v-6l-8-3Z"/></svg>`;

export interface CopyButtonOptions {
  site: SiteConfig;
  /** Whether this reply has anything MIRAGE put back (otherwise the site's own copy is enough). */
  shouldShow(turn: Element): boolean;
  /** Copies the reply with its details; resolves to whether it worked. */
  copy(turn: Element): Promise<boolean>;
  labels(): { copy: string; copied: string; failed: string };
}

function first(root: ParentNode, selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (el) return el;
  }
  return null;
}

export function startCopyButtons({ site, shouldShow, copy, labels }: CopyButtonOptions): {
  refresh(): void;
  stop(): void;
} {
  if (site.replyTurn.length === 0) return { refresh() {}, stop() {} };

  const makeButton = (turn: Element): HTMLElement => {
    const host = document.createElement(HOST_TAG);
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    const button = document.createElement('button');
    button.type = 'button';
    const text = document.createElement('span');
    const setText = (value: string) => {
      text.textContent = value;
      button.title = value;
    };
    button.innerHTML = ICON;
    button.append(text);
    setText(labels().copy);
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const ok = await copy(turn).catch(() => false);
      setText(ok ? labels().copied : labels().failed);
      setTimeout(() => setText(labels().copy), FEEDBACK_MS);
    });
    root.append(style, button);
    return host;
  };

  const refresh = () => {
    for (const selector of site.replyTurn) {
      for (const turn of document.querySelectorAll(selector)) {
        const existing = turn.querySelector(HOST_TAG);
        const wanted = shouldShow(turn);
        if (existing && !wanted) existing.remove();
        if (existing || !wanted) continue;
        first(turn, site.replyCopyButton)?.insertAdjacentElement('afterend', makeButton(turn));
      }
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 250);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  refresh();

  return {
    refresh,
    stop() {
      clearTimeout(timer);
      observer.disconnect();
      document.querySelectorAll(HOST_TAG).forEach((el) => el.remove());
    },
  };
}

/** The reply's text, as shown on screen. */
export function replyText(site: SiteConfig, turn: Element): string {
  const content = first(turn, site.replyContent);
  return content instanceof HTMLElement ? content.innerText.trim() : '';
}
