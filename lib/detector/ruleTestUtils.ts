// Shared table-driven checks for rule tests: each rule gets 5+ matches and 5+ look-alikes.

import { expect, it } from 'vitest';
import type { Rule } from './types';

/** [prompt text, exact value the rule must find in it] */
export type MatchCase = readonly [text: string, value: string];

export function describeRule(rule: Rule, matches: readonly MatchCase[], lookAlikes: readonly string[]): void {
  it('has at least 5 matching and 5 non-matching cases', () => {
    expect(matches.length).toBeGreaterThanOrEqual(5);
    expect(lookAlikes.length).toBeGreaterThanOrEqual(5);
  });

  it.each(matches)('finds it in %j', (text, value) => {
    const found = rule.find(text);
    expect(found.map((m) => m.value)).toContain(value);
    for (const m of found) expect(text.slice(m.start, m.end)).toBe(m.value);
  });

  it.each(lookAlikes)('does not match %j', (text) => {
    expect(rule.find(text)).toEqual([]);
  });
}
