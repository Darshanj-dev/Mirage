// Which of a set of text ranges the mouse is over. Highlights are not elements, so there are
// no hover events; this hit-tests the ranges' rectangles instead (once per animation frame).

import { useEffect, useRef, useState } from 'react';

export interface HoverTarget {
  index: number;
  rect: DOMRect;
}

const sameRect = (a: DOMRect, b: DOMRect) => a.top === b.top && a.left === b.left && a.width === b.width;

export function useRangeHover(ranges: readonly (Range | null)[]): HoverTarget | null {
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const rangesRef = useRef(ranges);
  rangesRef.current = ranges;

  useEffect(() => {
    let frame = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const list = rangesRef.current;
        for (let index = 0; index < list.length; index++) {
          for (const rect of list[index]?.getClientRects() ?? []) {
            if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top - 2 && e.clientY <= rect.bottom + 4) {
              setHover((prev) => (prev?.index === index && sameRect(prev.rect, rect) ? prev : { index, rect }));
              return;
            }
          }
        }
        setHover((prev) => (prev ? null : prev));
      });
    };
    document.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousemove', onMove);
    };
  }, []);

  return hover;
}
