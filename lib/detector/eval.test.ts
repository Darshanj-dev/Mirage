// Detector evaluation: precision, recall, F1, false-positive rate and latency on the corpus in
// test-prompts/corpus.ts (npm run eval). EVAL_WRITE=1 also writes docs/eval-results.json.

import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CORPUS, type Case, type Group } from '../../test-prompts/corpus';
import { detect } from './detect';

interface Score {
  cases: number;
  expected: number;
  found: number;
  falsePositives: number;
  precision: number;
  recall: number;
  f1: number;
  misses: string[];
  extras: string[];
}

function score(cases: readonly Case[]): Score {
  let expected = 0;
  let found = 0;
  let predicted = 0;
  let falsePositives = 0;
  const misses: string[] = [];
  const extras: string[] = [];
  for (const c of cases) {
    const findings = detect(c.text).filter((f) => f.policy !== 'warn');
    predicted += findings.length;
    const matched = new Set<number>();
    for (const e of c.expect) {
      expected++;
      const start = c.text.indexOf(e.value);
      const end = start + e.value.length;
      const hit = findings.findIndex((f, i) => !matched.has(i) && f.policy === e.action && f.start < end && start < f.end);
      if (start >= 0 && hit >= 0) {
        found++;
        matched.add(hit);
      } else misses.push(`${c.id}: ${e.action} ${JSON.stringify(e.value)}`);
    }
    findings.forEach((f, i) => {
      if (matched.has(i)) return;
      falsePositives++;
      extras.push(`${c.id}: ${f.type} ${JSON.stringify(f.value)}`);
    });
  }
  const precision = predicted ? (predicted - falsePositives) / predicted : 1;
  const recall = expected ? found / expected : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return { cases: cases.length, expected, found, falsePositives, precision: r3(precision), recall: r3(recall), f1: r3(f1), misses, extras };
}

function latency(): { meanMs: number; p95Ms: number; prompt2kMs: number; prompt20kMs: number } {
  const times: number[] = [];
  for (let round = 0; round < 5; round++) {
    for (const c of CORPUS) {
      const t0 = performance.now();
      detect(c.text);
      times.push(performance.now() - t0);
    }
  }
  times.sort((a, b) => a - b);
  const long = CORPUS.map((c) => c.text).join('\n');
  const time = (text: string) => {
    const t0 = performance.now();
    detect(text);
    return performance.now() - t0;
  };
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    meanMs: r2(times.reduce((s, t) => s + t, 0) / times.length),
    p95Ms: r2(times[Math.floor(times.length * 0.95)]!),
    prompt2kMs: r2(time(long.slice(0, 2000))),
    prompt20kMs: r2(time(long.repeat(3).slice(0, 20000))),
  };
}

const GROUPS: Group[] = ['pii', 'secret', 'clean', 'adversarial', 'obfuscated'];

describe('detector evaluation', () => {
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g, score(CORPUS.filter((c) => c.group === g))])) as Record<Group, Score>;
  const overall = score(CORPUS);
  const clean = CORPUS.filter((c) => c.group === 'clean');
  const cleanFlagged = clean.filter((c) => detect(c.text).some((f) => f.policy !== 'warn')).map((c) => c.id);
  const falsePositiveRate = Math.round((cleanFlagged.length / clean.length) * 1000) / 1000;
  const speed = latency();

  it('has the required corpus sizes', () => {
    const count = (g: Group) => CORPUS.filter((c) => c.group === g).length;
    expect(byGroup.pii.expected).toBeGreaterThanOrEqual(50);
    expect(byGroup.secret.expected).toBeGreaterThanOrEqual(50);
    expect(count('clean')).toBeGreaterThanOrEqual(25);
    expect(count('adversarial')).toBeGreaterThanOrEqual(25);
    expect(count('obfuscated')).toBeGreaterThanOrEqual(25);
  });

  it('reports the results', () => {
    const table = GROUPS.map((g) => ({
      group: g,
      cases: byGroup[g].cases,
      items: byGroup[g].expected,
      recall: byGroup[g].recall,
      precision: byGroup[g].precision,
      f1: byGroup[g].f1,
      falsePositives: byGroup[g].falsePositives,
    }));
    console.table(table);
    console.log({ overall: { precision: overall.precision, recall: overall.recall, f1: overall.f1 }, falsePositiveRate, cleanFlagged, ...speed });
    console.log('misses', overall.misses);
    console.log('extras', overall.extras);
    if (process.env.EVAL_WRITE) {
      writeFileSync(
        'docs/eval-results.json',
        JSON.stringify({ date: new Date().toISOString().slice(0, 10), groups: table, overall, falsePositiveRate, cleanFlagged, latency: speed }, null, 2) + '\n',
      );
    }
  });

  // Gates: a release must not fall below these.
  it('blocks every secret', () => expect(byGroup.secret.recall).toBe(1));
  it('hides at least 95% of personal data', () => expect(byGroup.pii.recall).toBeGreaterThanOrEqual(0.95));
  it('keeps false positives on clean prompts at or below 10%', () => expect(falsePositiveRate).toBeLessThanOrEqual(0.1));
  it('catches at least 90% of adversarial and obfuscated inputs', () => {
    expect(byGroup.adversarial.recall).toBeGreaterThanOrEqual(0.9);
    expect(byGroup.obfuscated.recall).toBeGreaterThanOrEqual(0.9);
  });
  it('scans a 2,000-character prompt in under 50 ms', () => expect(speed.prompt2kMs).toBeLessThan(50));
});
