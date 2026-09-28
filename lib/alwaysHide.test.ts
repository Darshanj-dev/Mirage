import { describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { MAX_TERM_LENGTH, addAlwaysHide, termFromSelection } from './alwaysHide';
import { loadAlwaysMask } from './vault';

describe('right-click "Always hide"', () => {
  it('cleans the selection', () => {
    expect(termFromSelection('  Priya \n Nair ')).toBe('Priya Nair');
  });

  it('rejects empty, one-letter and very long selections', () => {
    expect(termFromSelection(undefined)).toBeNull();
    expect(termFromSelection('   ')).toBeNull();
    expect(termFromSelection('a')).toBeNull();
    expect(termFromSelection('x'.repeat(MAX_TERM_LENGTH + 1))).toBeNull();
  });

  it('adds the term to the encrypted list once, ignoring case', async () => {
    expect(await addAlwaysHide('Priya Nair')).toBe(true);
    expect(await addAlwaysHide('priya nair')).toBe(true);
    expect(await loadAlwaysMask()).toEqual(['Priya Nair']);
    expect(JSON.stringify(await browser.storage.local.get(null))).not.toContain('Priya');
  });
});
