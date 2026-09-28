// S1 shield badge: grey (off), blue outline (watching), blue with a count (found),
// red with ! (secret), grey with ! (error or page changed).

import type { CSSProperties } from 'react';
import type { BadgeStatus } from './usePromptWatcher';

interface Props {
  status: BadgeStatus;
  count: number;
  label: string; // tooltip text, also read by screen readers
  style: CSSProperties;
  onClick(): void;
  onHoverChange(hovering: boolean): void;
}

export function ShieldBadge({ status, count, label, style, onClick, onHoverChange }: Props) {
  const mark = status === 'secret' || status === 'error' || status === 'pageChanged' ? '!' : status === 'found' ? String(count) : '';
  return (
    <button
      type="button"
      className={`mirage-badge mirage-badge--${status}`}
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
