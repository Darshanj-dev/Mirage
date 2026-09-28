// Everything MIRAGE shows inside the chatbot page, rendered in a Shadow DOM.

import { useState } from 'react';
import { isSecretType, type Finding } from '@/lib/detector/types';
import type { SiteConfig } from '@/lib/sites';
import { obscure, secretName, t, tCount, typeName } from '@/lib/strings';
import { ShieldBadge } from './ShieldBadge';
import { Tooltip } from './Tooltip';
import { usePromptWatcher, type BadgeStatus } from './usePromptWatcher';

const BADGE_SIZE = 30;

function badgeText(status: BadgeStatus, count: number): string {
  switch (status) {
    case 'off':
      return t('badge_off');
    case 'watching':
      return t('badge_watching');
    case 'found':
      return tCount('badge_found', count);
    case 'secret':
      return t('badge_secret');
    case 'error':
      return t('badge_error');
    case 'pageChanged':
      return t('error_pageChanged');
  }
}

/** One line per finding. Real values are never shown in full outside the prompt box. */
function findingLine(finding: Finding, token: string | null): string {
  const type = finding.type;
  if (isSecretType(type)) return `${typeName(type)}: ${obscure(finding.value)}`;
  return `${typeName(type)} → ${token ?? '…'}`;
}

function hoverText(finding: Finding, token: string | null): string {
  const type = finding.type;
  if (isSecretType(type)) return t('block_title', [secretName(type)]);
  return t('highlight_hover', [token ?? '…']);
}

export function MirageApp({ site }: { site: SiteConfig }) {
  const { status, scan, anchor, hover, turnOn } = usePromptWatcher(site);
  const [badgeHover, setBadgeHover] = useState(false);

  // Just above the top-right corner of the composer, so it never covers the site's own buttons.
  const badgeRect = anchor
    ? {
        top: Math.max(4, anchor.top - BADGE_SIZE - 6),
        left: anchor.right - BADGE_SIZE - 8,
        width: BADGE_SIZE,
        bottom: Math.max(4, anchor.top - BADGE_SIZE - 6) + BADGE_SIZE,
      }
    : { top: window.innerHeight - BADGE_SIZE - 16, left: window.innerWidth - BADGE_SIZE - 16, width: BADGE_SIZE, bottom: window.innerHeight - 16 };

  const count = scan.findings.length;
  const hovered = hover ? scan.findings[hover.index] : undefined;

  return (
    <>
      <ShieldBadge
        status={status}
        count={count}
        label={badgeText(status, count)}
        style={{ top: badgeRect.top, left: badgeRect.left }}
        onClick={() => {
          if (status === 'off') void turnOn();
        }}
        onHoverChange={setBadgeHover}
      />

      {(badgeHover || status === 'pageChanged') && (
        <Tooltip rect={badgeRect} align="end">
          <p className="mirage-tooltip__title">{badgeText(status, count)}</p>
          {badgeHover && count > 0 && (
            <ul className="mirage-tooltip__list">
              {scan.findings.map((f, i) => (
                <li key={`${f.start}-${f.end}`} className={isSecretType(f.type) ? 'is-secret' : 'is-mask'}>
                  {findingLine(f, scan.tokens[i] ?? null)}
                </li>
              ))}
            </ul>
          )}
        </Tooltip>
      )}

      {hover && hovered && !badgeHover && (
        <Tooltip rect={hover.rect}>{hoverText(hovered, scan.tokens[hover.index] ?? null)}</Tooltip>
      )}
    </>
  );
}
