// M1 gate: the detector finds exactly the expected items in every test prompt.

import { describe, expect, it } from 'vitest';
import data from '../../test-prompts/prompts.json';
import { detect } from './detect';

interface TestPrompt {
  id: string;
  category: 'personal' | 'secret' | 'normal';
  text: string;
  expected: { type: string; value: string }[];
  names?: string[];
}

const prompts = data.prompts as TestPrompt[];

describe('test prompt set', () => {
  it('has 50+ prompts: 20 personal, 15 secret, 15 normal', () => {
    expect(prompts.length).toBeGreaterThanOrEqual(50);
    expect(prompts.filter((p) => p.category === 'personal')).toHaveLength(20);
    expect(prompts.filter((p) => p.category === 'secret')).toHaveLength(15);
    expect(prompts.filter((p) => p.category === 'normal')).toHaveLength(15);
    expect(new Set(prompts.map((p) => p.id)).size).toBe(prompts.length);
  });

  it.each(prompts.map((p) => [p.id, p] as const))('%s finds exactly the expected items', (_id, prompt) => {
    const found = detect(prompt.text).map(({ type, value }) => ({ type, value }));
    const byPosition = (a: { value: string }, b: { value: string }) =>
      prompt.text.indexOf(a.value) - prompt.text.indexOf(b.value);
    expect(found).toEqual([...prompt.expected].sort(byPosition));
  });

  it('blocks every secret prompt', () => {
    for (const p of prompts.filter((q) => q.category === 'secret')) {
      expect(detect(p.text).some((f) => f.policy === 'block'), p.id).toBe(true);
    }
  });
});
