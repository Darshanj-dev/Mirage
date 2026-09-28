// Settings, stats and meta records (docs/schema.md). No personal data lives here, so they are
// plain JSON in storage.local. Written only by the service worker; pages read them via messages.

import { browser } from 'wxt/browser';
import type { MaskType } from './detector/types';

export type Site = 'chatgpt' | 'gemini';

export interface Settings {
  v: 1;
  enabled: boolean;
  quickMode: boolean;
  protectedSendCount: number; // drives the Quick mode offer after 5
  quickModeOffered: boolean;
  safeWords: string[]; // normalized; words never hidden
  awsNameCheck: boolean; // only if AWS is set up
  sites: { chatgpt: boolean; gemini: boolean };
}

export interface Counts {
  hidden: number; // personal details replaced
  blocked: number; // secrets stopped
  restoreFailures: number; // placeholders the AI changed
  allowOnce: number; // sends without hiding
  byType: Partial<Record<MaskType | 'SECRET', number>>;
}

export interface Stats {
  v: 1;
  weekStart: string; // ISO date of this week's Monday, e.g. '2026-09-28'
  week: Counts; // reset when weekStart changes
  lifetime: Counts;
}

export interface Meta {
  schemaVersion: number;
  installedAt: number;
  onboardingDone: boolean;
  lastVaultSweepAt: number;
}

export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  v: 1,
  enabled: true,
  quickMode: false,
  protectedSendCount: 0,
  quickModeOffered: false,
  safeWords: [],
  awsNameCheck: false,
  sites: { chatgpt: true, gemini: true },
};

export const emptyCounts = (): Counts => ({ hidden: 0, blocked: 0, restoreFailures: 0, allowOnce: 0, byType: {} });

/** ISO date (local time) of the Monday that starts the week containing `now`. */
export function weekStartOf(now: number): string {
  const d = new Date(now);
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);
const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string') : [];

export const normalizeWord = (word: string): string => word.trim().replace(/\s+/g, ' ').toLowerCase();

/** Fills any missing or malformed field from defaults, so older records never crash newer code. */
export function settingsWithDefaults(raw: unknown): Settings {
  const r = isObject(raw) ? raw : {};
  const sites = isObject(r.sites) ? r.sites : {};
  return {
    v: 1,
    enabled: bool(r.enabled, DEFAULT_SETTINGS.enabled),
    quickMode: bool(r.quickMode, DEFAULT_SETTINGS.quickMode),
    protectedSendCount: num(r.protectedSendCount, DEFAULT_SETTINGS.protectedSendCount),
    quickModeOffered: bool(r.quickModeOffered, DEFAULT_SETTINGS.quickModeOffered),
    safeWords: [...new Set(strings(r.safeWords).map(normalizeWord).filter(Boolean))],
    awsNameCheck: bool(r.awsNameCheck, DEFAULT_SETTINGS.awsNameCheck),
    sites: {
      chatgpt: bool(sites.chatgpt, DEFAULT_SETTINGS.sites.chatgpt),
      gemini: bool(sites.gemini, DEFAULT_SETTINGS.sites.gemini),
    },
  };
}

function countsWithDefaults(raw: unknown): Counts {
  const r = isObject(raw) ? raw : {};
  const byType: Counts['byType'] = {};
  if (isObject(r.byType)) {
    for (const [k, v] of Object.entries(r.byType)) {
      if (typeof v === 'number') byType[k as keyof Counts['byType']] = v;
    }
  }
  return {
    hidden: num(r.hidden, 0),
    blocked: num(r.blocked, 0),
    restoreFailures: num(r.restoreFailures, 0),
    allowOnce: num(r.allowOnce, 0),
    byType,
  };
}

export function statsWithDefaults(raw: unknown, now: number): Stats {
  const r = isObject(raw) ? raw : {};
  const thisWeek = weekStartOf(now);
  const sameWeek = r.weekStart === thisWeek;
  return {
    v: 1,
    weekStart: thisWeek,
    week: sameWeek ? countsWithDefaults(r.week) : emptyCounts(),
    lifetime: countsWithDefaults(r.lifetime),
  };
}

export function metaWithDefaults(raw: unknown, now: number): Meta {
  const r = isObject(raw) ? raw : {};
  return {
    schemaVersion: num(r.schemaVersion, SCHEMA_VERSION),
    installedAt: num(r.installedAt, now),
    onboardingDone: bool(r.onboardingDone, false),
    lastVaultSweepAt: num(r.lastVaultSweepAt, 0),
  };
}

/** Adds a delta of counts (numbers only, never content). */
export function addCounts(base: Counts, delta: Partial<Counts>): Counts {
  const byType = { ...base.byType };
  for (const [k, v] of Object.entries(delta.byType ?? {})) {
    const key = k as keyof Counts['byType'];
    byType[key] = (byType[key] ?? 0) + (v ?? 0);
  }
  return {
    hidden: base.hidden + (delta.hidden ?? 0),
    blocked: base.blocked + (delta.blocked ?? 0),
    restoreFailures: base.restoreFailures + (delta.restoreFailures ?? 0),
    allowOnce: base.allowOnce + (delta.allowOnce ?? 0),
    byType,
  };
}

// ---------------------------------------------------------------- storage (service worker only)

export async function loadSettings(): Promise<Settings> {
  const { settings } = await browser.storage.local.get('settings');
  return settingsWithDefaults(settings);
}

export async function saveSettings(patch: Partial<Omit<Settings, 'v'>>): Promise<Settings> {
  const next = settingsWithDefaults({ ...(await loadSettings()), ...patch });
  await browser.storage.local.set({ settings: next });
  return next;
}

export async function loadStats(now: number = Date.now()): Promise<Stats> {
  const { stats } = await browser.storage.local.get('stats');
  return statsWithDefaults(stats, now);
}

export async function recordCounts(delta: Partial<Counts>, now: number = Date.now()): Promise<Stats> {
  const stats = await loadStats(now);
  const next: Stats = { ...stats, week: addCounts(stats.week, delta), lifetime: addCounts(stats.lifetime, delta) };
  await browser.storage.local.set({ stats: next });
  return next;
}

export async function loadMeta(now: number = Date.now()): Promise<Meta> {
  const { meta } = await browser.storage.local.get('meta');
  return metaWithDefaults(meta, now);
}

export async function saveMeta(patch: Partial<Meta>, now: number = Date.now()): Promise<Meta> {
  const next = metaWithDefaults({ ...(await loadMeta(now)), ...patch }, now);
  await browser.storage.local.set({ meta: next });
  return next;
}

/** Writes defaults for any missing record. Safe to run on every install and update. */
export async function ensureDefaults(now: number = Date.now()): Promise<void> {
  const current = await browser.storage.local.get(['settings', 'stats', 'meta']);
  await browser.storage.local.set({
    settings: settingsWithDefaults(current.settings),
    stats: statsWithDefaults(current.stats, now),
    meta: { ...metaWithDefaults(current.meta, now), schemaVersion: SCHEMA_VERSION },
  });
}
