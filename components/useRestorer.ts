// Puts real values back into the chat on screen and tracks them for hover tooltips (S5).

import { useEffect, useState } from 'react';
import { sendMessage } from '@/lib/messages';
import { setRestoreHighlights } from '@/lib/page/highlights';
import { startRestorer, type RestoredSpan } from '@/lib/page/restore';
import { findPromptBox, type SiteConfig } from '@/lib/sites';
import { useRangeHover } from './useRangeHover';

export function useRestorer(site: SiteConfig) {
  const [spans, setSpans] = useState<RestoredSpan[]>([]);

  useEffect(
    () =>
      startRestorer({
        site,
        // Never touch what the user is typing.
        isExcluded: (node) => !!findPromptBox(site)?.contains(node),
        isEditable: (node) => !!node.parentElement?.closest('[contenteditable]:not([contenteditable="false"])'),
        onSpans(next) {
          const ok = (s: RestoredSpan) => s.kind === 'restored' || s.kind === 'view';
          setRestoreHighlights(
            next.filter(ok).map((s) => s.range),
            next.filter((s) => !ok(s)).map((s) => s.range),
          );
          setSpans(next);
        },
        onFailures(count) {
          void sendMessage({ type: 'COUNT', delta: { restoreFailures: count } });
        },
      }),
    [site],
  );

  const hover = useRangeHover(spans.map((s) => s.range));
  return { spans, hover };
}
