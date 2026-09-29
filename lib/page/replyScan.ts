// Output protection: AI → user. Reads each AI reply once it has finished streaming and reports
// secrets and high-severity IDs in it (a credential the model echoed back, a key it invented that
// looks real, someone else's Aadhaar it repeated). It never changes the reply: it only tells the
// user and underlines what it found (docs/app-flow.md, Reply check).
//
// Cheap by design: the observer only notes which reply changed; a reply is read once, 1.2 s
// after its last change, and only again if its text changed.

import { canonicalText } from '../detector/canonical';
import { detect } from '../detector/detect';
import type { DetectSettings, Finding } from '../detector/types';
import { findReplies, type SiteConfig } from '../sites';
import { readPrompt } from './promptText';

export interface ReplyAlert {
  id: number;
  reply: HTMLElement;
  findings: Finding[];
  ranges: Range[];
  /** False for replies that were already on the page when MIRAGE started: underline only. */
  fresh: boolean;
}

export interface ReplyScanOptions {
  site: SiteConfig;
  enabled(): boolean;
  settings(): DetectSettings;
  /** looseKey() of every value MIRAGE itself put back (the user's own details): never reported. */
  knownValues(): ReadonlySet<string>;
  onAlerts(alerts: ReplyAlert[]): void;
}

const QUIET_MS = 1200;
const MAX_REPLY_CHARS = 60_000;

/** A comparison key that ignores spacing, dashes and case: "2341 2341 2346" = "234123412346". */
export const looseKey = (value: string): string => canonicalText(value).replace(/[\s-]/g, '').toUpperCase();

/** Only what could hurt: secrets and government or bank IDs. */
const reportable = (f: Finding) => f.severity === 'critical' || f.severity === 'high';

export function startReplyScanner({ site, enabled, settings, knownValues, onAlerts }: ReplyScanOptions): () => void {
  if (site.replyContent.length === 0) return () => {};

  const lastText = new WeakMap<HTMLElement, string>();
  const alerts = new Map<HTMLElement, ReplyAlert>();
  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  const initial = new WeakSet<HTMLElement>(findReplies(site));
  let nextId = 1;
  let stopped = false;

  const publish = () => {
    for (const reply of alerts.keys()) if (!reply.isConnected) alerts.delete(reply);
    onAlerts([...alerts.values()]);
  };

  const check = (reply: HTMLElement) => {
    timers.delete(reply);
    if (stopped || !reply.isConnected || !enabled()) return;
    const prompt = readPrompt(reply);
    const text = prompt.text.slice(0, MAX_REPLY_CHARS);
    if (lastText.get(reply) === text) return;
    lastText.set(reply, text);

    const known = knownValues();
    let findings: Finding[] = [];
    try {
      findings = detect(text, settings()).filter((f) => reportable(f) && !known.has(looseKey(f.value)));
    } catch {
      findings = []; // the reply check is advisory: a failure must never disturb the page
    }
    if (findings.length === 0) {
      if (alerts.delete(reply)) publish();
      return;
    }
    const previous = alerts.get(reply);
    alerts.set(reply, {
      id: previous?.id ?? nextId++,
      reply,
      findings,
      ranges: findings.map((f) => prompt.rangeFor(f.start, f.end)).filter((r): r is Range => !!r),
      fresh: !initial.has(reply),
    });
    publish();
  };

  const touch = (reply: HTMLElement) => {
    clearTimeout(timers.get(reply));
    timers.set(reply, setTimeout(() => check(reply), QUIET_MS));
  };

  const replyOf = (node: Node): HTMLElement | null => {
    const el = node instanceof Element ? node : node.parentElement;
    if (!el) return null;
    for (const selector of site.replyContent) {
      try {
        const reply = el.closest<HTMLElement>(selector);
        if (reply) return reply;
      } catch {
        // unparsable selector: try the next one
      }
    }
    return null;
  };

  const observer = new MutationObserver((records) => {
    const dirty = new Set<HTMLElement>();
    for (const record of records) {
      const reply = replyOf(record.target);
      if (reply) dirty.add(reply);
      for (const added of record.addedNodes) {
        if (added instanceof Element && !reply) for (const r of findReplies(site, added)) dirty.add(r);
      }
    }
    dirty.forEach(touch);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  for (const reply of findReplies(site)) touch(reply);

  return () => {
    stopped = true;
    observer.disconnect();
    for (const timer of timers.values()) clearTimeout(timer);
  };
}
