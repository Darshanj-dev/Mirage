// Small panels: the error stop (with Try again) and the "send without hiding?" confirm.

import { t } from '@/lib/strings';
import { Panel } from './Panel';

export function ErrorPanel({ anchor, onRetry, onSendRaw, onClose }: {
  anchor: DOMRect | null;
  onRetry(): void;
  onSendRaw(): void;
  onClose(): void;
}) {
  return (
    <Panel
      tone="neutral"
      anchor={anchor}
      title={t('error_check')}
      onEscape={onClose}
      actions={
        <>
          <button type="button" className="mirage-link" onClick={onSendRaw}>
            {t('preview_allowOnce')}
          </button>
          <span className="mirage-spacer" />
          <button type="button" className="mirage-btn" onClick={onClose}>
            {t('preview_cancel')}
          </button>
          <button type="button" className="mirage-btn mirage-btn--primary" onClick={onRetry}>
            {t('error_retry')}
          </button>
        </>
      }
    >
      {null}
    </Panel>
  );
}

export function ConfirmRawPanel({ anchor, siteName, onConfirm, onBack }: {
  anchor: DOMRect | null;
  siteName: string;
  onConfirm(): void;
  onBack(): void;
}) {
  return (
    <Panel
      tone="neutral"
      anchor={anchor}
      title={t('preview_confirmRaw', [siteName])}
      onEscape={onBack}
      actions={
        <>
          <span className="mirage-spacer" />
          <button type="button" className="mirage-btn mirage-btn--primary" onClick={onBack}>
            {t('preview_cancel')}
          </button>
          <button type="button" className="mirage-btn" onClick={onConfirm}>
            {t('preview_allowOnce')}
          </button>
        </>
      }
    >
      {null}
    </Panel>
  );
}
