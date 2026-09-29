// Output protection notice: a small card when an AI reply contains a secret or ID number.
// It never changes the reply; "Show me" scrolls to it and underlines what was found.

import type { ReplyAlert as Alert } from '@/lib/page/replyScan';
import { findingName, t } from '@/lib/strings';

export function ReplyAlert({ alert, bottom, right, onShow, onDismiss }: {
  alert: Alert;
  bottom: number;
  right: number;
  onShow(): void;
  onDismiss(): void;
}) {
  const n = alert.findings.length;
  const text = n === 1 ? t('reply_one', [findingName(alert.findings[0]!)]) : t('reply_many', [n]);
  return (
    <div className="mirage-alert" role="status" style={{ bottom, right }}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 2.5 4 5.5v6c0 5 3.4 8.9 8 10 4.6-1.1 8-5 8-10v-6l-8-3Z" />
      </svg>
      <div className="mirage-alert__text">
        <p>{text}</p>
        <p className="mirage-alert__note">{t('reply_note')}</p>
      </div>
      <button type="button" className="mirage-btn mirage-btn--small" onClick={onShow}>
        {t('reply_show')}
      </button>
      <button type="button" className="mirage-link" onClick={onDismiss}>
        {t('reply_dismiss')}
      </button>
    </div>
  );
}
