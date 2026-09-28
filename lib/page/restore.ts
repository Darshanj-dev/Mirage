// Puts real values back into the chat on screen (F6; docs/app-flow.md, note 3).
//
// Only the text *inside* existing text nodes changes: no elements are added, so the site's
// own rendering keeps working. If the site rewrites a node (as it does while a reply streams),
// the observer sees the placeholders again and restores them again. The dotted underline is a
// CSS highlight, not an element.

import { sendMessage } from '../messages';
import type { SiteConfig } from '../sites';
import { TOKEN_PATTERN, findTokens } from '../tokenizer';
import { onChatRenamed, resolveChatId } from './chatId';

/**
 * restored: the value was written back into the text.
 * view: the placeholder sits in an editable box (like ChatGPT's email card). Writing the value
 *   there could let the site save it, so the text stays as is and the value shows on hover only.
 * failed: the AI changed the placeholder. expired: the chat's values were cleared.
 */
export type RestoreKind = 'restored' | 'view' | 'failed' | 'expired';

export interface RestoredSpan {
  range: Range;
  token: string;
  kind: RestoreKind;
  value?: string; // only for 'view', shown in the hover tooltip
}

export interface RestorerOptions {
  site: SiteConfig;
  /** Text nodes to leave alone completely, e.g. inside the prompt box. */
  isExcluded(node: Text): boolean;
  /** Text nodes the user or site can edit: never written to, values shown on hover only. */
  isEditable(node: Text): boolean;
  onSpans(spans: RestoredSpan[]): void;
  onFailures(count: number): void;
}

const SKIP_PARENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT']);
const BATCH_MS = 60;

export function startRestorer({ site, isExcluded, isEditable, onSpans, onFailures }: RestorerOptions): () => void {
  const values = new Map<string, Map<string, string>>(); // chatId -> token -> value (page memory only)
  const written = new WeakMap<Text, string>(); // text MIRAGE last wrote into a node
  const spans = new Map<Text, RestoredSpan[]>();
  const reportedFailures = new Set<string>();
  const pending = new Set<Text>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const wanted = (node: Text): boolean =>
    node.isConnected &&
    node.data.includes('«') &&
    written.get(node) !== node.data &&
    !SKIP_PARENTS.has(node.parentElement?.tagName ?? '') &&
    !isExcluded(node);

  const queueTree = (root: Node) => {
    if (root.nodeType === Node.TEXT_NODE) {
      pending.add(root as Text);
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as Text).data.includes('«')) pending.add(n as Text);
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), BATCH_MS);
  };

  async function flush(): Promise<void> {
    const nodes = [...pending].filter(wanted);
    pending.clear();
    if (nodes.length === 0 || stopped) return;

    const chatId = await resolveChatId(site);
    const known = values.get(chatId) ?? new Map<string, string>();
    values.set(chatId, known);

    const missing = [...new Set(nodes.flatMap((n) => findTokens(n.data)))].filter((t) => !known.has(t));
    let found = true;
    if (missing.length > 0) {
      const res = await sendMessage({ type: 'RESTORE', site: site.id, chatId, tokens: missing });
      if (res.ok) {
        for (const [token, value] of Object.entries(res.values)) known.set(token, value);
        found = res.found;
      }
    }
    if (stopped) return;

    let newFailures = 0;
    for (const node of nodes) {
      if (!wanted(node)) continue;
      const editable = isEditable(node);
      const nodeSpans: { start: number; end: number; token: string; kind: RestoreKind; value?: string }[] = [];
      let out = '';
      let last = 0;
      for (const m of node.data.matchAll(TOKEN_PATTERN)) {
        const token = m[0];
        const index = m.index ?? 0;
        out += node.data.slice(last, index);
        const value = known.get(token);
        const start = out.length;
        if (value !== undefined && editable) {
          out += token;
          nodeSpans.push({ start, end: out.length, token, kind: 'view', value });
        } else if (value !== undefined) {
          out += value;
          nodeSpans.push({ start, end: out.length, token, kind: 'restored' });
        } else {
          out += token;
          nodeSpans.push({ start, end: out.length, token, kind: found ? 'failed' : 'expired' });
          if (found && !reportedFailures.has(`${chatId}|${token}`)) {
            reportedFailures.add(`${chatId}|${token}`);
            newFailures++;
          }
        }
        last = index + token.length;
      }
      out += node.data.slice(last);

      if (!editable && out !== node.data) node.data = out;
      written.set(node, node.data);
      spans.set(
        node,
        nodeSpans.map(({ start, end, token, kind, value }) => {
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, end);
          return value === undefined ? { range, token, kind } : { range, token, kind, value };
        }),
      );
    }

    for (const node of spans.keys()) if (!node.isConnected) spans.delete(node);
    onSpans([...spans.values()].flat());
    if (newFailures > 0) onFailures(newFailures);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') pending.add(record.target as Text);
      else record.addedNodes.forEach(queueTree);
    }
    if (pending.size > 0) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  queueTree(document.body);
  schedule();

  // A new chat's values just moved to its real id: look again at anything not yet put back.
  const stopListening = onChatRenamed(() => {
    for (const [node, nodeSpans] of spans) {
      if (nodeSpans.some((s) => s.kind === 'failed' || s.kind === 'expired')) {
        written.delete(node);
        pending.add(node);
      }
    }
    schedule();
  });

  return () => {
    stopped = true;
    clearTimeout(timer);
    observer.disconnect();
    stopListening();
  };
}
