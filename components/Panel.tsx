// The frame shared by the review, error and confirm panels: it slides up above the composer,
// takes keyboard focus, and closes on Esc. The top edge carries the risk colour.

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

export type PanelTone = 'safe' | 'low' | 'high' | 'critical' | 'neutral';

interface Props {
  tone: PanelTone;
  anchor: DOMRect | null;
  title: string;
  onEscape(): void;
  children?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  actions: ReactNode;
}

const SHIELD = 'M12 2.5 4 5.5v6c0 5 3.4 8.9 8 10 4.6-1.1 8-5 8-10v-6l-8-3Z';

export function Panel({ tone, anchor, title, onEscape, children, header, footer, actions }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus the primary button, so Enter confirms and focus leaves the chatbot's prompt box.
    ref.current?.querySelector<HTMLButtonElement>('.mirage-btn--primary')?.focus();
  }, [title]);

  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation(); // keep keys away from the chatbot's own shortcuts
    if (e.key === 'Escape') onEscape();
  };

  const width = anchor ? Math.max(360, Math.min(anchor.width, 680)) : Math.min(window.innerWidth - 32, 640);
  const left = Math.max(8, anchor ? anchor.left + (anchor.width - width) / 2 : (window.innerWidth - width) / 2);
  const bottom = anchor ? window.innerHeight - anchor.top + 12 : 96;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      className={`mirage-panel mirage-panel--${tone}`}
      style={{ left, width: Math.min(width, window.innerWidth - 16), bottom, maxHeight: Math.max(220, window.innerHeight - bottom - 24) }}
      onKeyDown={onKeyDown}
    >
      <div className="mirage-panel__head">
        <svg className="mirage-panel__icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d={SHIELD} />
        </svg>
        <h2 className="mirage-panel__title">{title}</h2>
        {header}
      </div>
      {footer && <p className="mirage-panel__footer">{footer}</p>}
      {children && <div className="mirage-panel__body">{children}</div>}
      <div className="mirage-panel__actions">{actions}</div>
    </div>
  );
}
