// The review panel (S3 + S4 merged): risk level and score, what was found and why, exactly what
// the AI will see, and the choices. Real values never appear in full here (Content rule 7).

import { useState } from 'react';
import type { Finding } from '@/lib/detector/types';
import {
  findingLabel,
  findingName,
  levelName,
  obscure,
  reasonText,
  riskLineLabel,
  t,
  tCount,
} from '@/lib/strings';
import { protectedText, type ReviewState } from './useSendFlow';
import { Panel } from './Panel';

interface Props {
  siteName: string;
  anchor: DOMRect | null;
  review: ReviewState;
  blockSecrets: boolean;
  showQuickOffer: boolean;
  onQuickModeOn(): void;
  onProtect(): void;
  onToggle(index: number): void;
  onEdit(): void;
  onSendAnyway(): void;
}

const PLACEHOLDER = /(«[A-Z_]+(?:_\d+)?»)/;

export function RiskChip({ level, score }: { level: ReviewState['risk']['level']; score: number }) {
  return (
    <span className={`mirage-level mirage-level--${level}`}>
      <span className="mirage-level__dot" aria-hidden="true" />
      {t('level_chip', [levelName(level), score])}
    </span>
  );
}

function actionLabel(f: Finding, kept: boolean): string {
  if (f.policy === 'warn') return t('review_warnHealth');
  if (kept) return t('review_kept');
  return f.policy === 'block' ? t('review_removed') : '';
}

export function ReviewPanel({
  siteName,
  anchor,
  review,
  blockSecrets,
  showQuickOffer,
  onQuickModeOn,
  onProtect,
  onToggle,
  onEdit,
  onSendAnyway,
}: Props) {
  const [details, setDetails] = useState(false);
  const { findings, risk, tokens, keep } = review;
  const secrets = findings.filter((f) => f.policy === 'block');
  const firstSecret = secrets[0];
  const hiddenCount = new Set(
    findings.map((f, i) => (f.policy === 'mask' && !keep.has(i) ? tokens[i] : null)).filter(Boolean),
  ).size;
  const nothingProtected = findings.every((f, i) => f.policy === 'warn' || keep.has(i));

  const title = firstSecret
    ? t('block_title', [findingName(firstSecret)])
    : hiddenCount > 0
      ? tCount('review_title', hiddenCount)
      : t('review_titleKeepAll');
  const subtitle = firstSecret ? t('block_body') : t('review_subtitle', [siteName]);
  const secretLocked = secrets.length > 0 && blockSecrets;
  const out = protectedText(review);

  // Kept values show obscured in the preview, like every value outside the prompt box.
  const keptText = new Map<string, string>();
  findings.forEach((f, i) => keep.has(i) && keptText.set(f.value, obscure(f.value)));

  return (
    <Panel
      tone={risk.level}
      anchor={anchor}
      title={title}
      onEscape={onEdit}
      header={<RiskChip level={risk.level} score={risk.score} />}
      footer={
        <>
          {subtitle}
          {showQuickOffer && !firstSecret && (
            <span className="mirage-panel__offer">
              {t('preview_quickOfferQuestion')}
              <button type="button" className="mirage-link" onClick={onQuickModeOn}>
                {t('preview_quickOfferAction')}
              </button>
            </span>
          )}
        </>
      }
      actions={
        <>
          {secretLocked ? (
            <span className="mirage-note">{t('review_secretLocked')}</span>
          ) : (
            <button type="button" className="mirage-link" onClick={onSendAnyway}>
              {t('review_sendAnyway')}
            </button>
          )}
          <button type="button" className="mirage-link" aria-expanded={details} onClick={() => setDetails(!details)}>
            {details ? t('review_hideDetails') : t('review_details')}
          </button>
          <span className="mirage-spacer" />
          <button type="button" className="mirage-btn" onClick={onEdit}>
            {t('block_edit')}
          </button>
          <button type="button" className={`mirage-btn mirage-btn--primary mirage-btn--${risk.level}`} onClick={onProtect}>
            {nothingProtected ? t('review_send') : t('review_protect')}
          </button>
        </>
      }
    >
      {!details && (
        <ul className="mirage-chips" aria-label={t('review_details')}>
          {findings.map((f, i) => (
            <li key={`${f.start}-${f.end}`} className={`mirage-tag mirage-tag--${f.severity}${keep.has(i) ? ' is-kept' : ''}`}>
              {findingLabel(f)}
            </li>
          ))}
        </ul>
      )}
      {details && <ul className="mirage-items">
        {findings.map((f, i) => {
          const kept = keep.has(i);
          const lockable = f.policy === 'block' && blockSecrets;
          return (
            <li key={`${f.start}-${f.end}`} className={`mirage-item mirage-item--${f.severity}${kept ? ' is-kept' : ''}`}>
              <span className="mirage-item__sev" aria-hidden="true" />
              <span className="mirage-item__name">{findingLabel(f)}</span>
              <span className="mirage-item__to">
                {f.policy === 'mask' && !kept ? <code>{tokens[i]}</code> : actionLabel(f, kept)}
              </span>
              {details && (
                <span className="mirage-item__why">
                  {reasonText(f.reason)}
                  {f.context ? ` · ${t('review_near', [f.context])}` : ''} · {t('review_sure', [Math.round(f.confidence * 100)])}
                </span>
              )}
              {details && f.policy !== 'warn' && (
                <button
                  type="button"
                  className="mirage-toggle"
                  disabled={lockable}
                  aria-pressed={!kept}
                  aria-label={t('review_toggleLabel', [kept ? t('review_keep') : t('review_hide'), findingLabel(f)])}
                  onClick={() => onToggle(i)}
                >
                  {kept ? t('review_keep') : f.policy === 'block' ? t('review_remove') : t('review_hide')}
                </button>
              )}
            </li>
          );
        })}
      </ul>}

      {details && (
        <p className="mirage-why">
          <strong>{t('review_why', [risk.score])}</strong>{' '}
          {risk.lines.map((l) => `${riskLineLabel(l)} +${l.points}`).join(' · ')}
        </p>
      )}

      <p className="mirage-label">{t('review_aiSees', [siteName])}</p>
      <p className="mirage-prompt">
        {out.text.split(PLACEHOLDER).map((part, i) =>
          PLACEHOLDER.test(part) ? (
            <span key={i} className={`mirage-pill${part.endsWith('_REMOVED»') ? ' mirage-pill--secret' : ''}`}>
              {part}
            </span>
          ) : (
            <span key={i}>{[...keptText].reduce((s, [v, o]) => s.split(v).join(o), part)}</span>
          ),
        )}
      </p>
    </Panel>
  );
}
