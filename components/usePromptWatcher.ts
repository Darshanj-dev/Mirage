// Watches the chatbot's prompt box: finds it, scans it 300 ms after it changes, highlights
// findings, and asks the service worker which placeholder each detail would become.

import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { detect } from '@/lib/detector/detect';
import { isMaskType, type DetectSettings, type Finding, type MaskType } from '@/lib/detector/types';
import { sendMessage } from '@/lib/messages';
import { currentChatId, resolveChatId } from '@/lib/page/chatId';
import { clearHighlights, setHighlights } from '@/lib/page/highlights';
import { readPrompt } from '@/lib/page/promptText';
import { assessRisk, type Risk } from '@/lib/risk';
import type { RevealMode } from '@/lib/settings';
import { findComposer, locatePromptBox, type SiteConfig } from '@/lib/sites';
import { useRangeHover } from './useRangeHover';

export type BadgeStatus = 'off' | 'siteOff' | 'watching' | 'found' | 'secret' | 'error' | 'pageChanged';

export interface ScanResult {
  findings: Finding[];
  ranges: (Range | null)[];
  tokens: (string | null)[]; // placeholder per finding; null for secrets, warnings or while loading
  risk: Risk;
}

export interface PageSettings extends DetectSettings {
  enabled: boolean; // MIRAGE on, and on for this site
  globalEnabled: boolean;
  siteEnabled: boolean;
  quickMode: boolean;
  protectedSendCount: number;
  quickModeOffered: boolean;
  firstRun: boolean;
  blockSecrets: boolean;
  revealMode: RevealMode;
  checkReplies: boolean;
}

const SCAN_DELAY_MS = 300;
const POLL_MS = 500;
const MISSING_AFTER_MS = 8000;
const EMPTY_SCAN: ScanResult = { findings: [], ranges: [], tokens: [], risk: assessRisk([]) };

const sameRect = (a: DOMRect | null, b: DOMRect | null): boolean =>
  a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

export function usePromptWatcher(site: SiteConfig) {
  const [settings, setSettings] = useState<PageSettings | null>(null);
  const [settingsError, setSettingsError] = useState(false);
  const [box, setBox] = useState<HTMLElement | null>(null);
  const [limited, setLimited] = useState(false); // found by the fallback, not the site's selectors
  const [missing, setMissing] = useState(false);
  const [scan, setScan] = useState<ScanResult>(EMPTY_SCAN);
  const [detectError, setDetectError] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const settingsRef = useRef(settings);
  const boxRef = useRef(box);
  const scanId = useRef(0);
  settingsRef.current = settings;
  boxRef.current = box;

  // ---- settings: load once, reload when the popup or a page shortcut changes them
  const loadSettings = useCallback(async (): Promise<PageSettings | null> => {
    const res = await sendMessage({ type: 'GET_SETTINGS' });
    if (!res.ok) {
      setSettingsError(true);
      return null;
    }
    const siteEnabled = res.settings.sites[site.id] !== false;
    const next: PageSettings = {
      enabled: res.settings.enabled && siteEnabled,
      globalEnabled: res.settings.enabled,
      siteEnabled,
      quickMode: res.settings.quickMode,
      protectedSendCount: res.settings.protectedSendCount,
      quickModeOffered: res.settings.quickModeOffered,
      firstRun: res.firstRun,
      safeWords: res.settings.safeWords,
      alwaysMask: res.alwaysMask,
      categories: res.settings.categories,
      blockSecrets: res.settings.blockSecrets,
      revealMode: res.settings.revealMode,
      checkReplies: res.settings.checkReplies,
    };
    settingsRef.current = next;
    setSettings(next);
    setSettingsError(false);
    return next;
  }, [site]);

  useEffect(() => {
    void loadSettings();
    const onChange = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && ('settings' in changes || 'alwaysMask' in changes)) void loadSettings();
    };
    browser.storage.onChanged.addListener(onChange);
    return () => {
      try {
        browser.storage.onChanged.removeListener(onChange);
      } catch {
        // extension context already gone (reloaded or turned off)
      }
    };
  }, [loadSettings]);

  // ---- the prompt box: ChatGPT is a single-page app and swaps it out on navigation
  const updateAnchor = useCallback(() => {
    const el = boxRef.current;
    const rect = el ? findComposer(site, el).getBoundingClientRect() : null;
    setAnchor((prev) => (sameRect(prev, rect) ? prev : rect));
  }, [site]);

  useEffect(() => {
    let lastSeen = Date.now();
    const poll = () => {
      // A new chat's values were saved under a temporary id: move them as soon as the URL has a real one.
      void resolveChatId(site);
      const match = locatePromptBox(site);
      const found = match?.box ?? null;
      if (found) lastSeen = Date.now();
      if (found !== boxRef.current) setBox(found);
      setLimited(!!match?.fallback);
      setMissing(!found && Date.now() - lastSeen > MISSING_AFTER_MS);
      updateAnchor();
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    window.addEventListener('resize', updateAnchor);
    window.addEventListener('scroll', updateAnchor, true);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor, true);
    };
  }, [site, updateAnchor]);

  // ---- scanning
  const scanNow = useCallback(async () => {
    const el = boxRef.current;
    const current = settingsRef.current;
    const id = ++scanId.current;
    if (!el || !current?.enabled) {
      clearHighlights();
      setScan(EMPTY_SCAN);
      return;
    }
    try {
      const prompt = readPrompt(el);
      const findings = detect(prompt.text, current);
      const ranges = findings.map((f) => prompt.rangeFor(f.start, f.end));
      setHighlights(
        ranges.filter((r, i): r is Range => !!r && findings[i]!.policy === 'mask'),
        ranges.filter((r, i): r is Range => !!r && findings[i]!.policy === 'block'),
        ranges.filter((r, i): r is Range => !!r && findings[i]!.policy === 'warn'),
      );
      setDetectError(false);
      setScan({ findings, ranges, tokens: findings.map(() => null), risk: assessRisk(findings) });
      updateAnchor();

      const masked: { index: number; type: MaskType; value: string }[] = [];
      findings.forEach((f, index) => {
        const type = f.type;
        if (isMaskType(type)) masked.push({ index, type, value: f.value });
      });
      if (masked.length === 0) return;

      const res = await sendMessage({
        type: 'PREVIEW',
        site: site.id,
        chatId: currentChatId(site),
        findings: masked.map(({ type, value }) => ({ type, value })),
      });
      if (id !== scanId.current || !res.ok) return;
      const tokens: (string | null)[] = findings.map(() => null);
      masked.forEach((m, i) => (tokens[m.index] = res.tokens[i] ?? null));
      setScan((prev) => (id === scanId.current ? { ...prev, tokens } : prev));
    } catch {
      if (id !== scanId.current) return;
      clearHighlights();
      setScan(EMPTY_SCAN);
      setDetectError(true);
    }
  }, [site, updateAnchor]);

  // Rescan 300 ms after any change to the box (typing, paste, the site clearing it after send).
  useEffect(() => {
    void scanNow();
    if (!box) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void scanNow(), SCAN_DELAY_MS);
    });
    observer.observe(box, { childList: true, subtree: true, characterData: true });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [box, settings, scanNow]);

  useEffect(() => () => clearHighlights(), []);

  const hover = useRangeHover(scan.ranges);

  // ---- status for the badge
  let status: BadgeStatus;
  const actionable = scan.findings.filter((f) => f.policy !== 'warn');
  if (settingsError || detectError) status = 'error';
  else if (settings && !settings.globalEnabled) status = 'off';
  else if (settings && !settings.siteEnabled) status = 'siteOff';
  else if (missing) status = 'pageChanged';
  else if (actionable.some((f) => f.policy === 'block')) status = 'secret';
  else if (actionable.length > 0) status = 'found';
  else status = 'watching';

  const turnOn = useCallback(async () => {
    await sendMessage({ type: 'SET_SETTINGS', settings: { enabled: true } });
    await loadSettings();
  }, [loadSettings]);

  /** "Not personal": this value is never hidden again. */
  const markSafe = useCallback(
    async (value: string) => {
      const current = settingsRef.current?.safeWords ?? [];
      await sendMessage({ type: 'SET_SETTINGS', settings: { safeWords: [...current, value] } });
      await loadSettings();
    },
    [loadSettings],
  );

  return { status, limited, scan, anchor, hover, settings, settingsRef, loadSettings, turnOn, markSafe, retry: scanNow };
}
