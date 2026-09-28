// S3 preview panel: exactly what the chatbot will receive, with placeholders as blue pills.

import type { Finding } from '@/lib/detector/types';
import { t, tCount, typeName } from '@/lib/strings';
import { Panel } from './Panel';

interface Props {
  siteName: string;
  anchor: DOMRect | null;
  masked: string;
  hidden: readonly Finding[];
  replacements: readonly { text: string }[];
  showQuickOffer: boolean;
  onSend(): void;
  onCancel(): void;
  onSendRaw(): void;
}

const PLACEHOLDER = /(«[A-Z_]+(?:_\d+)?»)/;

export function PreviewPanel({ siteName, anchor, masked, hidden, replacements, showQuickOffer, onSend, onCancel, onSendRaw }: Props) {
  // Pill tooltip names the kind of detail, never the value itself.
  const kindOf = new Map(replacements.map((r, i) => [r.text, hidden[i] ? typeName(hidden[i].type) : '']));
  const count = new Set(replacements.map((r) => r.text)).size;

  return (
    <Panel
      tone="protect"
      anchor={anchor}
      title={t('preview_title', [siteName])}
      onEscape={onCancel}
      footer={
        <>
          {tCount('preview_footer', count)}
          {showQuickOffer && <span className="mirage-panel__offer">{t('preview_quickOffer')}</span>}
        </>
      }
      actions={
        <>
          <button type="button" className="mirage-link" onClick={onSendRaw}>
            {t('preview_allowOnce')}
          </button>
          <span className="mirage-spacer" />
          <button type="button" className="mirage-btn" onClick={onCancel}>
            {t('preview_cancel')}
          </button>
          <button type="button" className="mirage-btn mirage-btn--primary" onClick={onSend}>
            {t('preview_send')}
          </button>
        </>
      }
    >
      <p className="mirage-prompt">
        {masked.split(PLACEHOLDER).map((part, i) =>
          PLACEHOLDER.test(part) ? (
            <span key={i} className="mirage-pill" title={kindOf.get(part) ?? ''}>
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </p>
    </Panel>
  );
}
