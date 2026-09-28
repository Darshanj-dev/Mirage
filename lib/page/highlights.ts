// Underlines findings with the CSS Custom Highlight API: the page's DOM is never changed,
// so the chatbot's editor keeps working exactly as before.

const STYLE_ID = 'mirage-highlight-style';
const MASK = 'mirage-mask';
const BLOCK = 'mirage-block';

// ::highlight() only styles the document it is declared in, so this one small rule set goes
// into the page itself. It only targets MIRAGE's own highlight names.
const CSS_TEXT = `
::highlight(${MASK}) { text-decoration: underline 2px #2563eb; text-underline-offset: 3px; }
::highlight(${BLOCK}) { text-decoration: underline wavy 2px #dc2626; text-underline-offset: 3px; }
`;

export const highlightsSupported = (): boolean => typeof CSS !== 'undefined' && 'highlights' in CSS;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS_TEXT;
  (document.head ?? document.documentElement).append(style);
}

export function setHighlights(mask: readonly Range[], block: readonly Range[]): void {
  if (!highlightsSupported()) return;
  ensureStyle();
  CSS.highlights.set(MASK, new Highlight(...mask));
  CSS.highlights.set(BLOCK, new Highlight(...block));
}

export function clearHighlights(): void {
  if (!highlightsSupported()) return;
  CSS.highlights.delete(MASK);
  CSS.highlights.delete(BLOCK);
}
