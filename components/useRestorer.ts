// Puts real values back into the chat on screen and tracks them for hover tooltips (S5).

import { useEffect, useState } from 'react';
import { sendMessage } from '@/lib/messages';
import { setRestoreHighlights } from '@/lib/page/highlights';
import { startRestorer, type RestoredSpan } from '@/lib/page/restore';
import type { SiteConfig } from '@/lib/sites';
import { useRangeHover } from './useRangeHover';

export function useRestorer(site: SiteConfig) {
  const [spans, setSpans] = useState<RestoredSpan[]>([]);

  useEffect(
    () =>
      startRestorer({
        site,
        // Never rewrite what the user is typing.
        isExcluded: (node) => !!node.parentElement?.closest('[contenteditable="true"], [contenteditable=""]'),
        onSpans(next) {
          setRestoreHighlights(
            next.filter((s) => s.kind === 'restored').map((s) => s.range),
            next.filter((s) => s.kind !== 'restored').map((s) => s.range),
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
