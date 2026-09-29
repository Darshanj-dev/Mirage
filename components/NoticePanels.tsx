// Small panels: the error stop (with Try again) and the two "send anyway" confirms.

import { t } from '@/lib/strings';
import { Panel } from './Panel';

export function ErrorPanel({ anchor, onRetry, onClose }: { anchor: DOMRect | null; onRetry(): void; onClose(): void }) {
  // No "send anyway" here: if MIRAGE could not check the prompt, it does not know what is in it.
  return (
    <Panel
      tone="neutral"
      anchor={anchor}
      title={t('error_check')}
      onEscape={onClose}
      actions={
        <>
          <span className="mirage-spacer" />
          <button type="button" className="mirage-btn" onClick={onClose}>
            {t('preview_cancel')}
          </button>
          <button type="button" className="mirage-btn mirage-btn--primary" onClick={onRetry}>
            {t('error_retry')}
          </button>
        </>
      }
    />
  );
}

export function ConfirmRawPanel({ anchor, siteName, secret, onConfirm, onBack }: {
  anchor: DOMRect | null;
  siteName: string;
  secret: boolean;
  onConfirm(): void;
  onBack(): void;
}) {
  return (
    <Panel
      tone={secret ? 'critical' : 'neutral'}
      anchor={anchor}
      title={secret ? t('review_confirmSecret', [siteName]) : t('preview_confirmRaw', [siteName])}
      onEscape={onBack}
      actions={
        <>
          <span className="mirage-spacer" />
          <button type="button" className="mirage-btn" onClick={onConfirm}>
            {secret ? t('review_confirmSecretYes') : t('preview_allowOnce')}
          </button>
          <button type="button" className="mirage-btn mirage-btn--primary" onClick={onBack}>
            {t('review_back')}
          </button>
        </>
      }
    />
  );
}
