// Catches every way a prompt can leave the page (Enter, the send button, form submit, and the
// same for "edit message" boxes) before the chatbot sees it (docs/app-flow.md, Technical event
// flow, note 1).
//
// Listeners go on `window` in the capture phase, installed at document_start, so they run
// before any of the page's own handlers. Anything MIRAGE has not explicitly allowed is stopped:
// if the UI is not ready or something breaks, the prompt stays in the box (fail closed).

import {
  editBoxFor,
  editSendFromEvent,
  findEditSendButton,
  findPromptBox,
  findSendButton,
  sendButtonFromEvent,
  type SiteConfig,
} from '../sites';

export interface SendGuard {
  /** Called with the prompt (or edit) box whenever a send was stopped. */
  setHandler(handler: ((box: HTMLElement) => void) | null): void;
  /** When this returns true (MIRAGE is off here), sends pass through untouched. */
  setPassThrough(check: () => boolean): void;
  /**
   * When this returns true for the box, the user's own event goes through untouched: a prompt
   * with nothing to hide (including one MIRAGE already protected) is never stopped and replayed,
   * so sites that only trust real key presses or clicks keep working. Throwing counts as false.
   */
  setIsClean(check: ((box: HTMLElement) => boolean) | null): void;
  /** Presses the real send button for `box` and lets exactly that send through. */
  sendNow(box: HTMLElement): Promise<boolean>;
  dispose(): void;
}

const BUTTON_WAIT_MS = 3000;
/**
 * After MIRAGE sends, the site may finish the send a moment later (a click handler that calls
 * form.requestSubmit() after an async step), sometimes after re-rendering the prompt box, so
 * the box element can change. Send events pass for this long after MIRAGE's own send; the box
 * is empty by then, so nothing unchecked can go out.
 */
const ALLOW_WINDOW_MS = 1500;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function installSendGuard(site: SiteConfig): SendGuard {
  let allowUntil = 0;
  let handler: ((box: HTMLElement) => void) | null = null;
  let passThrough: () => boolean = () => false;
  let isClean: ((box: HTMLElement) => boolean) | null = null;
  /** The Send/Save button of an edit box the user clicked, to press again once checked. */
  const editButtons = new WeakMap<HTMLElement, HTMLButtonElement>();

  const stop = (event: Event, box: HTMLElement) => {
    if (Date.now() < allowUntil) return;
    try {
      if (passThrough()) return;
      if (isClean?.(box)) return;
    } catch {
      // Unknown state: keep the prompt in the box.
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    handler?.(box);
  };

  const promptBoxFor = (target: EventTarget | null): HTMLElement | null => {
    const box = findPromptBox(site);
    if (box && target instanceof Node && box.contains(target)) return box;
    return editBoxFor(site, target);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    const box = promptBoxFor(event.target);
    if (box) stop(event, box);
  };

  const onClick = (event: MouseEvent) => {
    if (sendButtonFromEvent(site, event.target)) {
      const box = findPromptBox(site);
      if (box) stop(event, box);
      return;
    }
    const edit = editSendFromEvent(site, event.target);
    if (edit) {
      editButtons.set(edit.box, edit.button);
      stop(event, edit.box);
    }
  };

  const onSubmit = (event: Event) => {
    if (!(event.target instanceof HTMLFormElement)) return;
    const box = findPromptBox(site);
    if (box && event.target.contains(box)) {
      stop(event, box);
      return;
    }
    const edit = [...event.target.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"]')]
      .map((el) => editBoxFor(site, el))
      .find((el): el is HTMLElement => !!el);
    if (edit) stop(event, edit);
  };

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('submit', onSubmit, true);

  /** The button that sends this box: the composer's send button, or an edit box's Send/Save. */
  const buttonFor = (box: HTMLElement): HTMLButtonElement | null => {
    if (box === findPromptBox(site)) return findSendButton(site, box);
    const clicked = editButtons.get(box);
    return clicked?.isConnected ? clicked : findEditSendButton(site, box);
  };

  return {
    setHandler(next) {
      handler = next;
    },
    setPassThrough(check) {
      passThrough = check;
    },
    setIsClean(check) {
      isClean = check;
    },
    async sendNow(box) {
      // The button can take a moment to enable after the text changes.
      const deadline = Date.now() + BUTTON_WAIT_MS;
      let button = buttonFor(box);
      while ((!button || button.disabled) && Date.now() < deadline) {
        await wait(50);
        button = buttonFor(box);
      }
      allowUntil = Date.now() + ALLOW_WINDOW_MS;
      if (button && !button.disabled) {
        button.click();
        return true;
      }
      // No button (some edit boxes send on Enter only): press Enter in the box.
      if (box !== findPromptBox(site) && box.isConnected) {
        box.focus();
        box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
        return true;
      }
      allowUntil = 0;
      return false;
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('submit', onSubmit, true);
    },
  };
}
