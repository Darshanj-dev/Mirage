// Wires "Copy with details" to what the restorer has put back on the page.

import { useEffect, useRef } from 'react';
import { sendMessage } from '@/lib/messages';
import { resolveChatId } from '@/lib/page/chatId';
import { replyText, startCopyButtons } from '@/lib/page/copyButtons';
import type { RestoredSpan } from '@/lib/page/restore';
import type { SiteConfig } from '@/lib/sites';
import { t } from '@/lib/strings';
import { TOKEN_PATTERN, findTokens } from '@/lib/tokenizer';

export function useCopyButtons(site: SiteConfig, spans: readonly RestoredSpan[]) {
  const spansRef = useRef(spans);
  spansRef.current = spans;
  const controller = useRef<{ refresh(): void } | null>(null);

  useEffect(() => {
    const buttons = startCopyButtons({
      site,
      shouldShow: (turn) =>
        spansRef.current.some(
          (s) => (s.kind === 'restored' || s.kind === 'view') && turn.contains(s.range.startContainer),
        ),
      async copy(turn) {
        let text = replyText(site, turn);
        // Placeholders still in the text (editable cards) are filled in for the copy only.
        const tokens = findTokens(text);
        if (tokens.length > 0) {
          const res = await sendMessage({ type: 'RESTORE', site: site.id, chatId: await resolveChatId(site), tokens });
          if (!res.ok) return false;
          text = text.replace(TOKEN_PATTERN, (token) => res.values[token] ?? token);
        }
        if (!text) return false;
        await navigator.clipboard.writeText(text);
        return true;
      },
      labels: () => ({ copy: t('restore_copy'), copied: t('restore_copied'), failed: t('restore_copyFailed') }),
    });
    controller.current = buttons;
    return () => {
      controller.current = null;
      buttons.stop();
    };
  }, [site]);

  // New or re-restored replies: show or hide buttons to match.
  useEffect(() => {
    controller.current?.refresh();
  }, [spans]);
}
