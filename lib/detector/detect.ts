// detect(text, settings): every finding in a prompt (docs/detection.md).
// A pure function, so it runs in the content script and in unit tests alike.
//
// Layers:
//   0 canonical.ts     normalize look-alike characters, keep a map back to the original
//   1 rules.ts         deterministic patterns with checksums (IDs, cards, known key formats)
//   2 rules.ts         entropy for unknown random-looking secrets
//   3 context.ts       confidence from nearby words; contextRules.ts for names, dates, accounts
//   4 taxonomy.ts      severity, category and recommended action per finding
// The risk score over all findings is lib/risk.ts.

import { canonicalize, canonicalText } from './canonical';
import { MIN_CONFIDENCE, scoreContext } from './context';
import { CONTEXT_RULES } from './contextRules';
import { normalizeValue } from './normalize';
import { PATTERN_RULES } from './rules';
import { CATEGORY, SEVERITY } from './taxonomy';
import type { DetectSettings, Finding, Match, Policy, Rule } from './types';

export const EMPTY_SETTINGS: DetectSettings = { safeWords: [], alwaysMask: [] };

/** Every rule, in priority order for equal-length overlaps. */
export const RULES: readonly Rule[] = [...PATTERN_RULES, ...CONTEXT_RULES];

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-word, case-insensitive matches of the user's Always mask terms. */
function findCustomTerms(text: string, terms: readonly string[]): Match[] {
  const out: Match[] = [];
  for (const term of terms) {
    const trimmed = canonicalText(term).trim();
    if (!trimmed) continue;
    const pattern = escapeRegex(trimmed).replace(/\s+/g, '\\s+');
    for (const m of text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, 'giu'))) {
      if (m.index === undefined) continue;
      out.push({ start: m.index, end: m.index + m[0].length, value: m[0] });
    }
  }
  return out;
}

const POLICY_RANK: Record<Policy, number> = { block: 0, mask: 1, warn: 2 };

type Candidate = Finding & { rank: number };

/**
 * Keeps the strongest finding where findings overlap: secrets beat personal data
 * (a secret must never slip through as a placeholder), personal data beats warnings,
 * then longer beats shorter, then earlier rules beat later ones.
 */
function resolveOverlaps(candidates: readonly Candidate[]): Finding[] {
  const ordered = [...candidates].sort(
    (a, b) =>
      POLICY_RANK[a.policy] - POLICY_RANK[b.policy] ||
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

const safeKey = (value: string): string => canonicalText(value).trim().replace(/\s+/g, ' ').toLowerCase();

export function detect(text: string, settings: DetectSettings = EMPTY_SETTINGS): Finding[] {
  if (!text) return [];
  const canon = canonicalize(text);
  const scan = canon.text;
  const enabled = (rule: Rule) => settings.categories?.[CATEGORY[rule.type]] !== false;

  const candidates: Candidate[] = [];
  const add = (rule: Rule, m: Match, rank: number) => {
    const base = m.confidence ?? rule.confidence;
    const scored = scoreContext(scan, rule.type, m.start, m.end, base, m.value);
    if (rule.policy !== 'block' && scored.confidence < MIN_CONFIDENCE) return;
    const { start, end } = canon.toOriginal(m.start, m.end);
    candidates.push({
      type: rule.type,
      policy: rule.policy,
      category: CATEGORY[rule.type],
      severity: SEVERITY[rule.type],
      confidence: scored.confidence,
      reason: m.reason ?? rule.reason,
      ...(m.kind ? { kind: m.kind } : {}),
      ...(scored.context ? { context: scored.context } : {}),
      start,
      end,
      value: text.slice(start, end),
      rank,
    });
  };

  // MIRAGE's own placeholders («PAN_1», «API_KEY_REMOVED») are never findings themselves, so a
  // protected prompt checked again (or quoted back in a reply) comes out clean.
  const placeholders = [...scan.matchAll(/«[A-Z_]+(?:_\d+)?»/g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const onPlaceholder = (m: Match) => placeholders.some(([s, e]) => m.start < e && s < m.end);

  RULES.forEach((rule, rank) => {
    if (!enabled(rule)) return;
    for (const m of rule.find(scan)) if (!onPlaceholder(m)) add(rule, m, rank);
  });

  // Terms the user asked to hide are always on, whatever the category switches say.
  const custom: Rule = { type: 'CUSTOM', policy: 'mask', confidence: 0.99, reason: 'custom', find: () => [] };
  // Rank -1: a term the user listed wins over the automatic name rule on the same words.
  for (const m of findCustomTerms(scan, settings.alwaysMask)) add(custom, m, -1);

  // Safe words only ever apply to personal data; secrets are always blocked.
  const safe = new Set(settings.safeWords.map(safeKey));
  const allowed = candidates.filter(
    (c) => c.policy === 'block' || !(safe.has(safeKey(c.value)) || safe.has(normalizeValue(c.type, c.value).toLowerCase())),
  );

  return resolveOverlaps(allowed);
}
