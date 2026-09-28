// Everything MIRAGE shows inside the chatbot page, rendered in a Shadow DOM.

import { useState } from 'react';
import { isSecretType, type Finding } from '@/lib/detector/types';
import type { SendGuard } from '@/lib/page/sendGuard';
import type { RestoredSpan } from '@/lib/page/restore';
import type { SiteConfig } from '@/lib/sites';
import { obscure, secretName, t, tCount, typeName } from '@/lib/strings';
import { BlockPanel } from './BlockPanel';
import { ConfirmRawPanel, ErrorPanel } from './NoticePanels';
import { PreviewPanel } from './PreviewPanel';
import { ShieldBadge } from './ShieldBadge';
import { Tooltip } from './Tooltip';
import { usePromptWatcher, type BadgeStatus } from './usePromptWatcher';
import { useRestorer } from './useRestorer';
import { useSendFlow } from './useSendFlow';

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

function restoreText(span: RestoredSpan, siteName: string): string {
  if (span.kind === 'restored') return t('restore_hover', [siteName, span.token]);
  if (span.kind === 'expired') return t('restore_expired');
  return t('restore_failed', [siteName]);
}

export function MirageApp({ site, guard }: { site: SiteConfig; guard: SendGuard }) {
  const watcher = usePromptWatcher(site);
  const { status, scan, anchor, hover } = watcher;
  const flow = useSendFlow(site, guard, watcher.settingsRef, watcher.loadSettings);
  const restorer = useRestorer(site);
  const [badgeHover, setBadgeHover] = useState(false);

  // Just above the top-right corner of the composer, so it never covers the site's own buttons.
  const badgeTop = anchor ? Math.max(4, anchor.top - BADGE_SIZE - 6) : window.innerHeight - BADGE_SIZE - 16;
  const badgeLeft = anchor ? anchor.right - BADGE_SIZE - 8 : window.innerWidth - BADGE_SIZE - 16;
  const badgeRect = { top: badgeTop, left: badgeLeft, width: BADGE_SIZE, bottom: badgeTop + BADGE_SIZE };

  const count = scan.findings.length;
  const hovered = hover ? scan.findings[hover.index] : undefined;
  const restored = restorer.hover ? restorer.spans[restorer.hover.index] : undefined;
  const panel = flow.panel;

  return (
    <>
      {!panel && (
        <ShieldBadge
          status={status}
          count={count}
          label={badgeText(status, count)}
          style={{ top: badgeRect.top, left: badgeRect.left }}
          onClick={() => {
            if (status === 'off') void watcher.turnOn();
          }}
          onHoverChange={setBadgeHover}
        />
      )}

      {!panel && (badgeHover || status === 'pageChanged') && (
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

      {!panel && hover && hovered && !badgeHover && (
        <Tooltip rect={hover.rect}>{hoverText(hovered, scan.tokens[hover.index] ?? null)}</Tooltip>
      )}

      {restorer.hover && restored && <Tooltip rect={restorer.hover.rect}>{restoreText(restored, site.name)}</Tooltip>}

      {panel?.kind === 'preview' && (
        <PreviewPanel
          siteName={site.name}
          anchor={anchor}
          masked={panel.masked}
          hidden={panel.hidden}
          replacements={panel.replacements}
          showQuickOffer={false}
          onSend={flow.sendProtected}
          onCancel={flow.close}
          onSendRaw={flow.askSendRaw}
        />
      )}
      {panel?.kind === 'block' && (
        <BlockPanel
          anchor={anchor}
          text={panel.text}
          findings={panel.findings}
          onRemoveAndSend={flow.removeSecrets}
          onEdit={flow.close}
        />
      )}
      {panel?.kind === 'error' && (
        <ErrorPanel anchor={anchor} onRetry={flow.retry} onSendRaw={flow.askSendRaw} onClose={flow.close} />
      )}
      {panel?.kind === 'confirmRaw' && (
        <ConfirmRawPanel anchor={anchor} siteName={site.name} onConfirm={flow.confirmSendRaw} onBack={flow.back} />
      )}

      {flow.chip !== null && anchor && (
        <div className="mirage-chip" role="status" style={{ top: badgeRect.top, right: window.innerWidth - anchor.right + 8 }}>
          {tCount('quick_chip', flow.chip)}
        </div>
      )}
    </>
  );
}
