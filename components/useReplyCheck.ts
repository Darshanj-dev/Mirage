// Wires the reply check (lib/page/replyScan.ts) to settings and to the values MIRAGE put back.

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { sendMessage } from '@/lib/messages';
import { clearReplyHighlights, setReplyHighlights } from '@/lib/page/highlights';
import { looseKey, startReplyScanner, type ReplyAlert } from '@/lib/page/replyScan';
import type { SiteConfig } from '@/lib/sites';
import type { PageSettings } from './usePromptWatcher';

export function useReplyCheck(site: SiteConfig, settingsRef: MutableRefObject<PageSettings | null>, restoredValues: readonly string[]) {
  const [alerts, setAlerts] = useState<ReplyAlert[]>([]);
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set());
  const known = useRef<ReadonlySet<string>>(new Set());
  known.current = new Set(restoredValues.map(looseKey));
  const counted = useRef(new Set<number>());

  useEffect(() => {
    const stop = startReplyScanner({
      site,
      enabled: () => !!settingsRef.current?.enabled && settingsRef.current.checkReplies,
      settings: () => settingsRef.current ?? { safeWords: [], alwaysMask: [] },
      knownValues: () => known.current,
      onAlerts(next) {
        setAlerts(next);
        setReplyHighlights(next.flatMap((a) => a.ranges));
        for (const a of next) {
          if (a.fresh && !counted.current.has(a.id)) {
            counted.current.add(a.id);
            void sendMessage({ type: 'COUNT', delta: { replyWarnings: 1 } });
          }
        }
      },
    });
    return () => {
      stop();
      clearReplyHighlights();
    };
  }, [site, settingsRef]);

  const current = [...alerts].reverse().find((a) => a.fresh && !dismissed.has(a.id)) ?? null;
  return {
    current,
    show(alert: ReplyAlert) {
      alert.reply.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setDismissed(new Set([...dismissed, alert.id]));
    },
    dismiss(alert: ReplyAlert) {
      setDismissed(new Set([...dismissed, alert.id]));
    },
  };
}
