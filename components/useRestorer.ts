// Puts real values back into the chat on screen and tracks them for hover tooltips (S5).

import { useEffect, useState } from 'react';
import { sendMessage } from '@/lib/messages';
import { setRestoreHighlights } from '@/lib/page/highlights';
import { startRestorer, type RestoredSpan } from '@/lib/page/restore';
import { findPromptBox, inConversation, type SiteConfig } from '@/lib/sites';
import { useRangeHover } from './useRangeHover';

export function useRestorer(site: SiteConfig, revealMode: 'inline' | 'hover') {
  const [spans, setSpans] = useState<RestoredSpan[]>([]);
  const [values, setValues] = useState<readonly string[]>([]);

  useEffect(
    () =>
      startRestorer({
        site,
        // Never touch what the user is typing, and nothing outside the conversation's messages
        // (sites without known message containers fall back to the whole page).
        isExcluded: (node) =>
          !!findPromptBox(site)?.contains(node) ||
          (site.conversation.length > 0 && !!node.parentElement && !inConversation(site, node.parentElement)),
        isEditable: (node) =>
          revealMode === 'hover' || !!node.parentElement?.closest('[contenteditable]:not([contenteditable="false"])'),
        onSpans(next) {
          const ok = (s: RestoredSpan) => s.kind === 'restored' || s.kind === 'view';
          setRestoreHighlights(
            next.filter(ok).map((s) => s.range),
            next.filter((s) => !ok(s)).map((s) => s.range),
          );
          setSpans(next);
        },
        onValues: setValues,
        onFailures(count) {
          void sendMessage({ type: 'COUNT', delta: { restoreFailures: count } });
        },
      }),
    [site, revealMode],
  );

  const hover = useRangeHover(spans.map((s) => s.range));
  return { spans, hover, values };
}
