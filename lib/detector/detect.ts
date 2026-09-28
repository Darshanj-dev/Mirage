// detect(text, settings): every finding in a prompt (docs/app-flow.md, Message contracts).
// A pure function, so it runs in the content script and in unit tests alike.

import { normalizeValue } from './normalize';
import { RULES } from './rules';
import type { DetectSettings, Finding, Match } from './types';

export const EMPTY_SETTINGS: DetectSettings = { safeWords: [], alwaysMask: [] };

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-word, case-insensitive matches of the user's Always mask terms. */
function findCustomTerms(text: string, terms: readonly string[]): Match[] {
  const out: Match[] = [];
  for (const term of terms) {
    const trimmed = term.trim();
    if (!trimmed) continue;
    const pattern = escapeRegex(trimmed).replace(/\s+/g, '\\s+');
    for (const m of text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, 'giu'))) {
      if (m.index === undefined) continue;
      out.push({ start: m.index, end: m.index + m[0].length, value: m[0] });
    }
  }
  return out;
}

/**
 * Keeps the strongest finding where findings overlap: secrets beat personal data
 * (a secret must never slip through as a placeholder), then longer beats shorter,
 * then earlier rules beat later ones.
 */
function resolveOverlaps(candidates: (Finding & { rank: number })[]): Finding[] {
  const ordered = [...candidates].sort(
    (a, b) =>
      (a.policy === 'block' ? 0 : 1) - (b.policy === 'block' ? 0 : 1) ||
      b.end - b.start - (a.end - a.start) ||
      a.rank - b.rank ||
      a.start - b.start,
  );
  const kept: Finding[] = [];
  for (const { rank: _rank, ...finding } of ordered) {
    if (kept.some((k) => finding.start < k.end && k.start < finding.end)) continue;
    kept.push(finding);
  }
  return kept.sort((a, b) => a.start - b.start);
}

export function detect(text: string, settings: DetectSettings = EMPTY_SETTINGS): Finding[] {
  if (!text) return [];

  const candidates: (Finding & { rank: number })[] = [];
  RULES.forEach((rule, rank) => {
    for (const m of rule.find(text)) {
      candidates.push({ type: rule.type, policy: rule.policy, ...m, rank });
    }
  });
  for (const m of findCustomTerms(text, settings.alwaysMask)) {
    candidates.push({ type: 'CUSTOM', policy: 'mask', ...m, rank: RULES.length });
  }

  // Safe words only ever apply to personal data; secrets are always blocked.
  const safe = new Set(settings.safeWords.map((w) => w.trim().replace(/\s+/g, ' ').toLowerCase()));
  const allowed = candidates.filter(
    (c) =>
      c.policy === 'block' ||
      !(safe.has(c.value.trim().replace(/\s+/g, ' ').toLowerCase()) || safe.has(normalizeValue(c.type, c.value).toLowerCase())),
  );

  return resolveOverlaps(allowed);
}
