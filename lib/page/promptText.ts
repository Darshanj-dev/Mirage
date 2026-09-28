// Reads the text of a contenteditable prompt box and maps text offsets back to DOM ranges,
// so findings can be highlighted without touching the editor's own DOM.

const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'PRE', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL']);

interface Segment {
  node: Text;
  start: number; // offset of node's first character in `text`
}

export interface PromptText {
  text: string;
  /** A live DOM range for text[start, end), or null if the offsets fall outside text nodes. */
  rangeFor(start: number, end: number): Range | null;
}

export function readPrompt(root: HTMLElement): PromptText {
  if (root instanceof HTMLTextAreaElement) return readTextarea(root);

  let text = '';
  const segments: Segment[] = [];
  const newline = () => {
    if (text && !text.endsWith('\n')) text += '\n';
  };

  const walk = (parent: Node) => {
    for (const child of parent.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const node = child as Text;
        segments.push({ node, start: text.length });
        text += node.data;
      } else if (child instanceof HTMLElement) {
        if (child.tagName === 'BR') {
          // ProseMirror keeps a trailing <br> in empty lines; it is not a real line break.
          if (!child.classList.contains('ProseMirror-trailingBreak')) text += '\n';
          continue;
        }
        const block = BLOCK_TAGS.has(child.tagName);
        if (block) newline();
        walk(child);
        if (block) newline();
      }
    }
  };
  walk(root);

  return {
    text: text.replace(/\n$/, ''),
    rangeFor(start, end) {
      // An empty range at the very end: after the last character (for appending text).
      const last = segments.at(-1);
      if (start === end && last && start === last.start + last.node.length) {
        const range = document.createRange();
        range.setStart(last.node, last.node.length);
        range.collapse(true);
        return range;
      }
      const from = segments.find((s) => start >= s.start && start < s.start + s.node.length);
      const to = [...segments].reverse().find((s) => end > s.start && end <= s.start + s.node.length);
      if (!from || !to) return null;
      const range = document.createRange();
      range.setStart(from.node, start - from.start);
      range.setEnd(to.node, end - to.start);
      return range;
    },
  };
}

/** Textareas have no inner ranges to highlight; text only. */
function readTextarea(el: HTMLTextAreaElement): PromptText {
  return { text: el.value, rangeFor: () => null };
}
