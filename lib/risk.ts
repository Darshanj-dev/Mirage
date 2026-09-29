// The privacy risk score: one number from 0 to 100 for a prompt, with every point explained
// (docs/detection.md, Risk score). Pure, so the page, the popup and the tests share it.
//
//   1. Each distinct detail adds WEIGHT[type] × confidence. A second, third… detail of the same
//      type adds half its weight: the first PAN matters most.
//   2. Combinations add points, because together they say more than apart:
//        - a health detail together with anything that identifies the person  +15
//        - a government ID (Aadhaar, PAN) together with a phone or email       +10
//   3. The worst single item sets a floor: any critical item (a secret) makes the level
//      critical (score at least 71); any high item (Aadhaar, PAN, bank account) makes it at
//      least high (41). One Aadhaar number alone is not "low risk".
//   4. Capped at 100.
// Levels: safe (nothing found), low 1-40, high 41-70, critical 71-100.

import { normalizeValue } from './detector/normalize';
import { WEIGHT } from './detector/taxonomy';
import type { Finding, FindingType, Severity } from './detector/types';

export type RiskLevel = 'safe' | 'low' | 'high' | 'critical';

export interface RiskLine {
  /** What the points are for: a finding type, or a combination rule. */
  label: FindingType | 'COMBO_HEALTH_IDENTITY' | 'COMBO_ID_CONTACT' | 'FLOOR_CRITICAL' | 'FLOOR_HIGH';
  points: number;
  count?: number; // distinct details of this type
}

export interface Risk {
  score: number;
  level: RiskLevel;
  lines: RiskLine[]; // sums to `score`
  worst: Severity | null;
}

const IDENTIFYING: readonly FindingType[] = ['NAME', 'CUSTOM', 'AADHAAR', 'PAN', 'PHONE', 'EMAIL', 'DOB', 'BANK_ACCOUNT', 'UPI'];
const GOVERNMENT_ID: readonly FindingType[] = ['AADHAAR', 'PAN'];
const CONTACT: readonly FindingType[] = ['PHONE', 'EMAIL'];

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export const LEVEL_FLOOR = { high: 41, critical: 71 } as const;

export function levelFor(score: number): RiskLevel {
  if (score <= 0) return 'safe';
  if (score < LEVEL_FLOOR.high) return 'low';
  if (score < LEVEL_FLOOR.critical) return 'high';
  return 'critical';
}

export function assessRisk(findings: readonly Finding[]): Risk {
  if (findings.length === 0) return { score: 0, level: 'safe', lines: [], worst: null };

  // Distinct details per type (the same PAN typed twice counts once).
  const byType = new Map<FindingType, Map<string, number>>();
  for (const f of findings) {
    const seen = byType.get(f.type) ?? new Map<string, number>();
    const key = normalizeValue(f.type, f.value);
    seen.set(key, Math.max(seen.get(key) ?? 0, f.confidence));
    byType.set(f.type, seen);
  }

  const lines: RiskLine[] = [];
  for (const [type, values] of byType) {
    const confidences = [...values.values()].sort((a, b) => b - a);
    const points = confidences.reduce((sum, c, i) => sum + WEIGHT[type] * c * (i === 0 ? 1 : 0.5), 0);
    lines.push({ label: type, points: Math.round(points), count: confidences.length });
  }
  lines.sort((a, b) => b.points - a.points);

  const has = (types: readonly FindingType[]) => types.some((t) => byType.has(t));
  if (byType.has('HEALTH') && has(IDENTIFYING)) lines.push({ label: 'COMBO_HEALTH_IDENTITY', points: 15 });
  if (has(GOVERNMENT_ID) && has(CONTACT)) lines.push({ label: 'COMBO_ID_CONTACT', points: 10 });

  let score = Math.max(1, lines.reduce((sum, l) => sum + l.points, 0));
  const worst = findings.reduce<Severity>((w, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[w] ? f.severity : w), 'low');
  const floor = worst === 'critical' ? LEVEL_FLOOR.critical : worst === 'high' ? LEVEL_FLOOR.high : 0;
  if (score < floor) {
    lines.push({ label: worst === 'critical' ? 'FLOOR_CRITICAL' : 'FLOOR_HIGH', points: floor - score });
    score = floor;
  }
  if (score > 100) {
    // Scale the explanation down with the score so the lines still add up.
    const over = score - 100;
    const top = lines[0]!;
    top.points -= over;
    score = 100;
  }
  return { score, level: levelFor(score), lines, worst };
}
