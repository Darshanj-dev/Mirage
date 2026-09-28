// Automates the Content Guidelines checklist for the strings file.

import { describe, expect, it } from 'vitest';
import messages from '../public/_locales/en/messages.json';
import { obscure } from './strings';

const entries = Object.entries(messages as Record<string, { message: string }>);

describe('strings file', () => {
  it('has every key from the microcopy library', () => {
    const keys = [
      'badge_off', 'badge_watching', 'badge_found', 'badge_secret', 'badge_error',
      'highlight_hover', 'highlight_notPersonal',
      'preview_title', 'preview_footer', 'preview_send', 'preview_cancel', 'preview_allowOnce',
      'preview_confirmRaw', 'preview_quickOffer', 'quick_chip',
      'block_title', 'block_body', 'block_fix', 'block_edit',
      'restore_hover', 'restore_failed', 'restore_expired', 'restore_copy',
      'error_check', 'error_retry', 'error_pageChanged',
      'popup_status', 'popup_unsupported', 'popup_week', 'popup_clear', 'popup_clearConfirm', 'popup_footer',
      'welcome_headline', 'welcome_done',
    ];
    for (const key of keys) expect(messages, key).toHaveProperty(key);
  });

  it('uses Chrome-safe key names (letters, digits, underscores)', () => {
    for (const [key] of entries) expect(key).toMatch(/^[A-Za-z0-9_]+$/);
  });

  it.each(entries)('%s avoids banned and alarm words', (_key, { message }) => {
    expect(message).not.toMatch(/!/);
    expect(message).not.toMatch(/\b(WARNING|DANGER|ALERT|Oops|leak|careless|mistake|violation|100% secure|unhackable|guaranteed|military-grade|revolutionary)\b/i);
    expect(message).not.toMatch(/\bMirage\b/); // always MIRAGE
  });

  it('keeps buttons to 4 words', () => {
    for (const key of ['preview_send', 'preview_cancel', 'preview_allowOnce', 'block_fix', 'block_edit', 'error_retry', 'restore_copy', 'popup_clear', 'highlight_notPersonal']) {
      const text = (messages as Record<string, { message: string }>)[key]!.message;
      expect(text.split(/\s+/).length, key).toBeLessThanOrEqual(4);
    }
  });

  it('keeps badge tooltips to 12 words', () => {
    for (const [key, { message }] of entries.filter(([k]) => k.startsWith('badge_'))) {
      expect(message.split(/\s+/).length, key).toBeLessThanOrEqual(12);
    }
  });
});

describe('obscure', () => {
  it('shows only the first 3 and last 4 characters', () => {
    expect(obscure('sk-proj-Xq7Lm2Rt9Vb4Nc8Kd1Pf6Hs3Wz5J7f2a')).toBe('sk-•••••7f2a');
  });

  it('hides short values completely', () => {
    expect(obscure('7351')).toBe('••••');
    expect(obscure('tiger26')).toBe('•••••••');
  });
});
