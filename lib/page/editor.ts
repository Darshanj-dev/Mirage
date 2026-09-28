// Writes into the chatbot's prompt box the way a user would, so the site's own editor
// (ProseMirror on ChatGPT) records the change before sending (docs/app-flow.md, note 2).
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

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const normalize = (text: string) => text.replace(/ /g, ' ').trimEnd();

function selectRange(box: HTMLElement, range: Range): void {
  box.focus();
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
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
    const range = prompt.rangeFor(r.start, r.end);
    if (!range) return false;
    selectRange(box, range);
    // execCommand is deprecated but is still the one way to type into a rich editor
    // that it treats exactly like user input.
    if (!document.execCommand('insertText', false, r.text)) return false;
    await nextFrame(); // let the editor sync its own state before the next edit
  }
  await nextFrame();
  return normalize(readPrompt(box).text) === normalize(expectedResult);
}
