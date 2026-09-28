// The welcome page demo runs the real detector on its sample prompt. These checks keep the
// sample strings and the detector in step, so the demo never shows a raw placeholder.

import { describe, expect, it } from 'vitest';
import messages from '../public/_locales/en/messages.json';
import { detect } from './detector/detect';
import type { MaskType } from './detector/types';
import { assignTokens, emptyTokenState, findTokens, lookupTokens } from './tokenizer';

describe('welcome demo strings', () => {
  const prompt = messages.welcome_samplePrompt.message;
  const name = messages.welcome_sampleName.message;
  const findings = detect(prompt, { safeWords: [], alwaysMask: [name] });

  it('finds the sample name and PAN, and no secrets', () => {
    expect(findings.map((f) => [f.type, f.value])).toEqual([
      ['CUSTOM', 'Priya Nair'],
      ['PAN', 'ABCDE1234F'],
    ]);
  });

  it('uses only placeholders the sample prompt produces', () => {
    const { state } = assignTokens(
      emptyTokenState(),
      findings.map((f) => ({ type: f.type as MaskType, value: f.value })),
    );
    const replyTokens = findTokens(messages.welcome_sampleReply.message);
    expect(replyTokens.length).toBeGreaterThan(0);
    expect(Object.keys(lookupTokens(state, replyTokens))).toEqual(replyTokens);
  });
});
