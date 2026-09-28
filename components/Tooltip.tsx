// A small dark bubble above (or below, near the top of the screen) a rectangle on the page.

import type { ReactNode } from 'react';

interface Props {
  rect: { top: number; bottom: number; left: number; width: number };
  children: ReactNode;
  align?: 'center' | 'end';
  /** Takes the mouse (for a button inside); reports when the mouse enters or leaves it. */
  onHoverChange?(hovering: boolean): void;
}

export function Tooltip({ rect, children, align = 'center', onHoverChange }: Props) {
  const above = rect.top > 120;
  const style =
    align === 'end'
      ? { right: Math.max(8, window.innerWidth - (rect.left + rect.width)) }
      : { left: Math.min(Math.max(8, rect.left + rect.width / 2), window.innerWidth - 8) };
  return (
    <div
      role="tooltip"
      className={`mirage-tooltip mirage-tooltip--${align}${onHoverChange ? ' mirage-tooltip--interactive' : ''}`}
      onMouseEnter={onHoverChange && (() => onHoverChange(true))}
      onMouseLeave={onHoverChange && (() => onHoverChange(false))}
      style={{
        ...style,
        ...(above ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
      }}
    >
      {children}
    </div>
  );
}
