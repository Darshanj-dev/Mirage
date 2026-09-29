// S1 shield badge: grey (off), blue outline (watching), blue with a count (found),
// red with ! (secret), grey with ! (error or page changed).

import type { CSSProperties } from 'react';
import type { RiskLevel } from '@/lib/risk';
import type { BadgeStatus } from './usePromptWatcher';

interface Props {
  status: BadgeStatus;
  level: RiskLevel;
  limited: boolean; // prompt box found by the fallback
  count: number;
  label: string; // tooltip text, also read by screen readers
  style: CSSProperties;
  pulse?: boolean; // first run: pulse once so the user notices it
  onClick(): void;
  onHoverChange(hovering: boolean): void;
}

export function ShieldBadge({ status, level, limited, count, label, style, pulse = false, onClick, onHoverChange }: Props) {
  const mark = status === 'secret' || status === 'error' || status === 'pageChanged' ? '!' : status === 'found' ? String(count) : '';
  const tone = status === 'found' ? ` mirage-badge--${level}` : '';
  return (
    <button
      type="button"
      className={`mirage-badge mirage-badge--${status}${tone}${limited ? ' mirage-badge--limited' : ''}${pulse ? ' mirage-badge--pulse' : ''}`}
      style={style}
      aria-label={label}
      onClick={onClick}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onFocus={() => onHoverChange(true)}
      onBlur={() => onHoverChange(false)}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          className="mirage-badge__shield"
          d="M12 2.5 4 5.5v6c0 5 3.4 8.9 8 10 4.6-1.1 8-5 8-10v-6l-8-3Z"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      {mark && <span className="mirage-badge__mark">{mark.length > 2 ? '9+' : mark}</span>}
    </button>
  );
}
