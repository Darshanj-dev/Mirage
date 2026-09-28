// Service worker: owns the vault and answers messages from the page and the popup.

import { browser } from 'wxt/browser';
import { handleMessage } from '@/lib/handlers';
import { ensureDefaults, saveMeta } from '@/lib/settings';
import { sweepVault } from '@/lib/vault';

const SWEEP_ALARM = 'vault-sweep';

async function sweep(): Promise<void> {
  const now = Date.now();
  await sweepVault(now);
  await saveMeta({ lastVaultSweepAt: now }, now);
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void ensureDefaults();
  });

  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Only our own content scripts and pages may talk to the vault.
    if (sender.id !== browser.runtime.id) return false;
    void handleMessage(msg).then(sendResponse);
    return true; // respond asynchronously
  });

  // The 24-hour auto-clear: check every hour, and once when the worker starts.
  void browser.alarms.create(SWEEP_ALARM, { periodInMinutes: 60 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SWEEP_ALARM) void sweep();
  });
  void sweep();
});
