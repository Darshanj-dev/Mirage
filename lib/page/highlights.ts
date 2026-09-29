// Underlines text with the CSS Custom Highlight API: the page's DOM is never changed,
// so the chatbot's editor and replies keep working exactly as before.

const STYLE_ID = 'mirage-highlight-style';
const MASK = 'mirage-mask';
const BLOCK = 'mirage-block';
const WARN = 'mirage-warn';
const REPLY = 'mirage-reply-risk';
const RESTORED = 'mirage-restored';
const FAILED = 'mirage-failed';

// ::highlight() only styles the document it is declared in, so this one small rule set goes
// into the page itself. It only targets MIRAGE's own highlight names.
const CSS_TEXT = `
::highlight(${MASK}) { text-decoration: underline 2px #2563eb; text-underline-offset: 3px; }
::highlight(${BLOCK}) { text-decoration: underline wavy 2px #dc2626; text-underline-offset: 3px; }
::highlight(${RESTORED}) { text-decoration: underline dotted 1.5px rgb(37 99 235 / 0.75); text-underline-offset: 3px; }
::highlight(${FAILED}) { text-decoration: underline dotted 1.5px #d97706; text-underline-offset: 3px; }
::highlight(${WARN}) { text-decoration: underline dotted 2px #d97706; text-underline-offset: 3px; }
::highlight(${REPLY}) { background-color: rgb(245 158 11 / 0.22); text-decoration: underline wavy 1.5px #d97706; text-underline-offset: 3px; }
`;

export const highlightsSupported = (): boolean => typeof CSS !== 'undefined' && 'highlights' in CSS;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS_TEXT;
  (document.head ?? document.documentElement).append(style);
}

function set(name: string, ranges: readonly Range[]): void {
  if (!highlightsSupported()) return;
  ensureStyle();
  CSS.highlights.set(name, new Highlight(...ranges));
}

/** Findings in the prompt box: blue for hidden details, red for secrets, amber dots for kept health details. */
export function setHighlights(mask: readonly Range[], block: readonly Range[], warn: readonly Range[] = []): void {
  set(MASK, mask);
  set(BLOCK, block);
  set(WARN, warn);
}

export function clearHighlights(): void {
  if (!highlightsSupported()) return;
  CSS.highlights.delete(MASK);
  CSS.highlights.delete(BLOCK);
  CSS.highlights.delete(WARN);
}

/** Secrets or IDs found in AI replies (never changed, only marked). */
export function setReplyHighlights(ranges: readonly Range[]): void {
  set(REPLY, ranges);
}

export function clearReplyHighlights(): void {
  if (highlightsSupported()) CSS.highlights.delete(REPLY);
}

/** Values put back in the chat (faint dotted blue), and placeholders that could not be (amber). */
export function setRestoreHighlights(restored: readonly Range[], failed: readonly Range[]): void {
  set(RESTORED, restored);
  set(FAILED, failed);
}
