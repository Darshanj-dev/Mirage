// State and actions for the popup (S7). All reads and writes go through the service worker.

import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { normalizeWord, type Settings, type Stats } from '@/lib/settings';
import { sendMessage, type SettingsPatch } from '@/lib/messages';
import { siteForHost, type SiteConfig } from '@/lib/sites';

export interface PopupState {
  settings: Settings;
  alwaysMask: string[];
  stats: Stats | null;
  host: string | null; // the active tab's host, when MIRAGE may see it
  site: SiteConfig | null; // the supported site open in the active tab
}

export function usePopupState() {
  const [state, setState] = useState<PopupState | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const [res, statsRes, tabs] = await Promise.all([
      sendMessage({ type: 'GET_SETTINGS' }),
      sendMessage({ type: 'GET_STATS' }),
      browser.tabs.query({ active: true, currentWindow: true }).catch(() => []),
    ]);
    if (!res.ok) {
      setError(true);
      return;
    }
    // A tab's URL is only visible for sites MIRAGE has access to; anything else counts as unsupported.
    let host: string | null = null;
    try {
      host = tabs[0]?.url ? new URL(tabs[0].url).hostname : null;
    } catch {
      host = null;
    }
    setState({
      settings: res.settings,
      alwaysMask: res.alwaysMask,
      stats: statsRes.ok ? statsRes.stats : null,
      host,
      site: host ? siteForHost(host) : null,
    });
    setError(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (settings?: SettingsPatch, alwaysMask?: string[]) => {
    const res = await sendMessage({ type: 'SET_SETTINGS', ...(settings && { settings }), ...(alwaysMask && { alwaysMask }) });
    if (!res.ok) {
      setError(true);
      return;
    }
    setState((prev) => (prev ? { ...prev, settings: res.settings, alwaysMask: res.alwaysMask } : prev));
  }, []);

  const actions = {
    save: (patch: SettingsPatch) => save(patch),
    setEnabled: (enabled: boolean) => save({ enabled }),
    setQuickMode: (quickMode: boolean) => save({ quickMode }),
    addSafeWord: (word: string) => {
      const w = normalizeWord(word);
      if (!w || !state || state.settings.safeWords.includes(w)) return Promise.resolve();
      return save({ safeWords: [...state.settings.safeWords, w] });
    },
    removeSafeWord: (word: string) => save({ safeWords: state?.settings.safeWords.filter((w) => w !== word) ?? [] }),
    addAlwaysHide: (term: string) => {
      const clean = term.trim().replace(/\s+/g, ' ');
      if (!clean || !state || state.alwaysMask.some((t) => t.toLowerCase() === clean.toLowerCase())) {
        return Promise.resolve();
      }
      return save(undefined, [...state.alwaysMask, clean]);
    },
    removeAlwaysHide: (term: string) => save(undefined, state?.alwaysMask.filter((t) => t !== term) ?? []),
    clearVault: async (): Promise<number | null> => {
      const res = await sendMessage({ type: 'CLEAR_VAULT' });
      return res.ok ? res.cleared : null;
    },
  };

  return { state, error, reload: load, ...actions };
}
