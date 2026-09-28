// Catches every way a prompt can leave the prompt box (Enter, the send button, form submit)
// before the chatbot sees it (docs/app-flow.md, Technical event flow, note 1).
//
// Listeners go on `window` in the capture phase, installed at document_start, so they run
// before any of the page's own handlers. Anything MIRAGE has not explicitly allowed is stopped:
// if the UI is not ready or something breaks, the prompt stays in the box (fail closed).

import { findPromptBox, findSendButton, sendButtonFromEvent, type SiteConfig } from '../sites';

export interface SendGuard {
  /** Called with the prompt box whenever a send was stopped. */
  setHandler(handler: ((box: HTMLElement) => void) | null): void;
  /** When this returns true (MIRAGE is off), sends pass through untouched. */
  setPassThrough(check: () => boolean): void;
  /** Presses the real send button and lets exactly that one send through. */
  sendNow(box: HTMLElement): Promise<boolean>;
  dispose(): void;
}

const BUTTON_WAIT_MS = 3000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function installSendGuard(site: SiteConfig): SendGuard {
  let allowNext = false;
  let handler: ((box: HTMLElement) => void) | null = null;
  let passThrough: () => boolean = () => false;

  const stop = (event: Event, box: HTMLElement) => {
    if (allowNext) return;
    try {
      if (passThrough()) return;
    } catch {
      // Unknown state: keep the prompt in the box.
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    handler?.(box);
  };

  const inBox = (target: EventTarget | null): HTMLElement | null => {
    const box = findPromptBox(site);
    return box && target instanceof Node && box.contains(target) ? box : null;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    const box = inBox(event.target);
    if (box) stop(event, box);
  };

  const onClick = (event: MouseEvent) => {
    if (!sendButtonFromEvent(site, event.target)) return;
    const box = findPromptBox(site);
    if (box) stop(event, box);
  };

  const onSubmit = (event: Event) => {
    const box = findPromptBox(site);
    if (box && event.target instanceof HTMLFormElement && event.target.contains(box)) stop(event, box);
  };

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('submit', onSubmit, true);

  return {
    setHandler(next) {
      handler = next;
    },
    setPassThrough(check) {
      passThrough = check;
    },
    async sendNow(box) {
      // The button can take a moment to enable after the text changes.
      const deadline = Date.now() + BUTTON_WAIT_MS;
      let button = findSendButton(site, box);
      while ((!button || button.disabled) && Date.now() < deadline) {
        await wait(50);
        button = findSendButton(site, box);
      }
      if (!button || button.disabled) return false;
      allowNext = true;
      try {
        button.click();
      } finally {
        allowNext = false;
      }
      return true;
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('submit', onSubmit, true);
    },
  };
}
