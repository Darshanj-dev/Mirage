// Writes into the chatbot's prompt box the way a user would, so the site's own editor
// (ProseMirror on ChatGPT, Quill on Gemini, Lexical on Perplexity, React-controlled textareas)
// records the change before sending (docs/app-flow.md, note 2).
//
// Each span is selected and replaced with an insertText command, last span first so earlier
// offsets stay valid. Only the replaced spans change; line breaks and formatting stay as typed.

import { readPrompt } from './promptText';

export interface EditorReplacement {
  start: number;
  end: number;
  expected: string; // what must be at [start, end) right now, or nothing is written
  text: string;
}

/**
 * Lets the editor sync its own state. requestAnimationFrame never fires in a background tab, so
 * a timer caps the wait: a send must never hang half-way through writing placeholders.
 */
const nextFrame = () =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 50);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve();
    });
  });
const normalize = (text: string) => text.replace(/ /g, ' ').trimEnd();

function selectRange(box: HTMLElement, range: Range): void {
  box.focus();
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Selects [start, end) in the box, rich editor or textarea. */
function select(box: HTMLElement, start: number, end: number): boolean {
  if (box instanceof HTMLTextAreaElement) {
    box.focus();
    box.setSelectionRange(start, end);
    return box.selectionStart === start && box.selectionEnd === end;
  }
  const range = readPrompt(box).rangeFor(start, end);
  if (!range) return false;
  selectRange(box, range);
  return true;
}

/**
 * Replaces the selection like typing would. execCommand is deprecated but is still the one way
 * to type into a rich editor (or a framework-controlled textarea) that it treats exactly like
 * user input. If a textarea refuses it, the value is set through the native setter and an
 * input event is sent, which React and similar frameworks also pick up.
 */
function insert(box: HTMLElement, start: number, end: number, text: string): boolean {
  if (document.execCommand('insertText', false, text)) return true;
  if (!(box instanceof HTMLTextAreaElement)) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  const next = box.value.slice(0, start) + text + box.value.slice(end);
  if (!setter) return false;
  setter.call(box, next);
  box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  return true;
}

/**
 * Applies the replacements and checks the box now reads exactly `expectedResult`.
 * Returns false if anything did not match; the caller must then not send.
 */
export async function replaceInEditor(
  box: HTMLElement,
  replacements: readonly EditorReplacement[],
  expectedResult: string,
): Promise<boolean> {
  const ordered = [...replacements].sort((a, b) => b.start - a.start);
  for (const r of ordered) {
    const prompt = readPrompt(box);
    if (prompt.text.slice(r.start, r.end) !== r.expected) return false;
    if (!select(box, r.start, r.end)) return false;
    if (!insert(box, r.start, r.end, r.text)) return false;
    await nextFrame(); // let the editor sync its own state before the next edit
  }
  await nextFrame();
  return normalize(readPrompt(box).text) === normalize(expectedResult);
}
