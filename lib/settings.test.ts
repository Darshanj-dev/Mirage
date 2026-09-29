import { describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import {
  DEFAULT_SETTINGS,
  addCounts,
  emptyCounts,
  ensureDefaults,
  loadMeta,
  loadSettings,
  loadStats,
  recordCounts,
  saveSettings,
  settingsWithDefaults,
  weekStartOf,
} from './settings';

describe('settings', () => {
  it('uses defaults when nothing is stored', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('fills missing and malformed fields from defaults', () => {
    expect(settingsWithDefaults({ enabled: false, quickMode: 'yes', sites: { gemini: false } })).toEqual({
      ...DEFAULT_SETTINGS,
      enabled: false,
      sites: { ...DEFAULT_SETTINGS.sites, gemini: false },
    });
    expect(settingsWithDefaults(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('normalizes and de-duplicates safe words', async () => {
    const saved = await saveSettings({ safeWords: [' ABCDE1234F', 'abcde1234f', 'Order  ID', ''] });
    expect(saved.safeWords).toEqual(['abcde1234f', 'order id']);
  });

  it('merges a patch with what is stored', async () => {
    await saveSettings({ quickMode: true });
    const next = await saveSettings({ enabled: false });
    expect(next.quickMode).toBe(true);
    expect(next.enabled).toBe(false);
  });

  it('writes all defaults on install without overwriting existing choices', async () => {
    await browser.storage.local.set({ settings: { enabled: false } });
    await ensureDefaults(1_000);
    expect((await loadSettings()).enabled).toBe(false);
    expect((await loadMeta()).installedAt).toBe(1_000);
    expect(Object.keys(await browser.storage.local.get(null)).sort()).toEqual(['meta', 'settings', 'stats']);
  });
});

describe('stats', () => {
  it('finds the Monday that starts the week', () => {
    expect(weekStartOf(new Date(2026, 8, 28, 12).getTime())).toBe('2026-09-28'); // Monday
    expect(weekStartOf(new Date(2026, 9, 4, 23).getTime())).toBe('2026-09-28'); // Sunday after
    expect(weekStartOf(new Date(2026, 9, 5, 0, 1).getTime())).toBe('2026-10-05'); // next Monday
  });

  it('adds counts, including by type', () => {
    const total = addCounts(emptyCounts(), { hidden: 2, byType: { PAN: 1, PHONE: 1 } });
    expect(addCounts(total, { hidden: 1, blocked: 1, byType: { PAN: 1, SECRET: 1 } })).toEqual({
      ...emptyCounts(),
      hidden: 3,
      blocked: 1,
      byType: { PAN: 2, PHONE: 1, SECRET: 1 },
    });
  });

  it('keeps a today bucket that resets at midnight', async () => {
    const morning = new Date(2026, 8, 29, 9).getTime();
    await recordCounts({ checked: 3, protectedSends: 2 }, morning);
    expect((await loadStats(morning + 60_000)).today.checked).toBe(3);
    const tomorrow = new Date(2026, 8, 30, 9).getTime();
    const stats = await loadStats(tomorrow);
    expect(stats.today.checked).toBe(0);
    expect(stats.lifetime.checked).toBe(3);
  });

  it('defaults to blocking secrets, every category on and every site on', () => {
    const s = settingsWithDefaults({ categories: { location: false }, revealMode: 'weird' });
    expect(s.blockSecrets).toBe(true);
    expect(s.categories.location).toBe(false);
    expect(s.categories.apiKeys).toBe(true);
    expect(s.revealMode).toBe('hover'); // real details stay out of the page unless the user opts in
    expect(Object.values(s.sites).every(Boolean)).toBe(true);
  });

  it('resets the week but keeps lifetime counts when a new week starts', async () => {
    const monday = new Date(2026, 8, 28, 10).getTime();
    await recordCounts({ hidden: 5, blocked: 1 }, monday);
    const nextWeek = monday + 7 * 24 * 60 * 60 * 1000;
    await recordCounts({ hidden: 1 }, nextWeek);
    const stats = await loadStats(nextWeek);
    expect(stats.weekStart).toBe('2026-10-05');
    expect(stats.week.hidden).toBe(1);
    expect(stats.lifetime.hidden).toBe(6);
    expect(stats.lifetime.blocked).toBe(1);
  });
});
