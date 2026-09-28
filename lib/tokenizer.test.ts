import { describe, expect, it } from 'vitest';
import {
  SECRET_REMOVED,
  assignTokens,
  emptyTokenState,
  findTokens,
  formatToken,
  lookupTokens,
  replaceSpans,
} from './tokenizer';

describe('tokenizer', () => {
  it('formats placeholders as «TYPE_n»', () => {
    expect(formatToken('PAN', 1)).toBe('«PAN_1»');
  });

  it('numbers each type separately', () => {
    const { tokens } = assignTokens(emptyTokenState(), [
      { type: 'PAN', value: 'ABCDE1234F' },
      { type: 'PHONE', value: '98450 12345' },
      { type: 'PAN', value: 'BNZPM2501K' },
    ]);
    expect(tokens).toEqual(['«PAN_1»', '«PHONE_1»', '«PAN_2»']);
  });

  it('gives the same value the same token, however it was typed', () => {
    const first = assignTokens(emptyTokenState(), [{ type: 'PHONE', value: '98450 12345' }]);
    const second = assignTokens(first.state, [
      { type: 'PHONE', value: '+91 9845012345' },
      { type: 'PHONE', value: '09845012345' },
    ]);
    expect(second.tokens).toEqual(['«PHONE_1»', '«PHONE_1»']);
    expect(second.state.entries).toHaveLength(1);
  });

  it('matches email and UPI case-insensitively, PAN by upper case', () => {
    const { tokens } = assignTokens(emptyTokenState(), [
      { type: 'EMAIL', value: 'Priya@Example.com' },
      { type: 'EMAIL', value: 'priya@example.com' },
      { type: 'PAN', value: 'ABCDE1234F' },
      { type: 'PAN', value: 'abcde1234f' },
    ]);
    expect(tokens).toEqual(['«EMAIL_1»', '«EMAIL_1»', '«PAN_1»', '«PAN_1»']);
  });

  it('lets names and Always mask terms share PERSON numbers without clashing', () => {
    const { tokens } = assignTokens(emptyTokenState(), [
      { type: 'CUSTOM', value: 'Priya Nair' },
      { type: 'NAME', value: 'Rohit' },
      { type: 'NAME', value: 'priya  nair' },
    ]);
    expect(tokens).toEqual(['«PERSON_1»', '«PERSON_2»', '«PERSON_1»']);
  });

  it('keeps the value as first typed and does not mutate the input state', () => {
    const state = emptyTokenState();
    const result = assignTokens(state, [{ type: 'PHONE', value: '98450 12345' }], 1000);
    expect(state.entries).toHaveLength(0);
    expect(result.state.entries[0]).toEqual({
      token: '«PHONE_1»',
      type: 'PHONE',
      value: '98450 12345',
      normalized: '9845012345',
      firstSeen: 1000,
    });
  });

  it('looks up real values and leaves unknown tokens out', () => {
    const { state } = assignTokens(emptyTokenState(), [{ type: 'PAN', value: 'ABCDE1234F' }]);
    expect(lookupTokens(state, ['«PAN_1»', '«PAN_9»'])).toEqual({ '«PAN_1»': 'ABCDE1234F' });
  });

  it('replaces spans from the end so indexes stay valid', () => {
    const text = 'PAN ABCDE1234F, phone 98450 12345.';
    const masked = replaceSpans(text, [
      { start: 4, end: 14, text: '«PAN_1»' },
      { start: 22, end: 33, text: '«PHONE_1»' },
    ]);
    expect(masked).toBe('PAN «PAN_1», phone «PHONE_1».');
  });

  it('finds distinct placeholders in a reply, ignoring SECRET_REMOVED', () => {
    const reply = `Dear «PERSON_1», your PAN «PAN_1» and «PAN_1» again. ${SECRET_REMOVED} «PHONE_12»`;
    expect(findTokens(reply)).toEqual(['«PERSON_1»', '«PAN_1»', '«PHONE_12»']);
  });
});
