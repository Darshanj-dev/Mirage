// The frame shared by the preview, block, error and confirm panels: it slides up above the
// composer, takes keyboard focus, and closes on Esc.

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

interface Props {
  tone: 'protect' | 'block' | 'neutral';
  anchor: DOMRect | null;
  title: string;
  onEscape(): void;
  children: ReactNode;
  footer?: ReactNode;
  actions: ReactNode;
}

export function Panel({ tone, anchor, title, onEscape, children, footer, actions }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus the primary button, so Enter confirms and focus leaves the chatbot's prompt box.
    ref.current?.querySelector<HTMLButtonElement>('.mirage-btn--primary')?.focus();
  }, [title]);

  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation(); // keep keys away from the chatbot's own shortcuts
    if (e.key === 'Escape') onEscape();
  };

  const width = anchor ? Math.min(anchor.width, 720) : Math.min(window.innerWidth - 32, 640);
  const left = anchor ? anchor.left + (anchor.width - width) / 2 : (window.innerWidth - width) / 2;
  const bottom = anchor ? window.innerHeight - anchor.top + 12 : 96;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      className={`mirage-panel mirage-panel--${tone}`}
      style={{ left, width, bottom, maxHeight: Math.max(200, window.innerHeight - bottom - 24) }}
      onKeyDown={onKeyDown}
    >
      <h2 className="mirage-panel__title">{title}</h2>
      <div className="mirage-panel__body">{children}</div>
      {footer && <p className="mirage-panel__footer">{footer}</p>}
      <div className="mirage-panel__actions">{actions}</div>
    </div>
  );
}
