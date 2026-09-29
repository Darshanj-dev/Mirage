// Service worker: owns the vault and answers messages from the page and the popup.

import { browser } from 'wxt/browser';
import { addAlwaysHide } from '@/lib/alwaysHide';
import { handleMessage } from '@/lib/handlers';
import type { Sender } from '@/lib/messages';
import { siteForHost } from '@/lib/sites';
import { ALL_MATCHES } from '@/lib/sites/hosts';
import { ensureDefaults, loadSettings, saveMeta } from '@/lib/settings';
import { t } from '@/lib/strings';
import { sweepVault } from '@/lib/vault';

const SWEEP_ALARM = 'vault-sweep';
const MENU_ALWAYS_HIDE = 'mirage-always-hide';

/** MIRAGE's own pages (popup, settings, welcome) vs. a content script inside a chatbot page. */
function senderOf(sender: { url?: string; tab?: { url?: string } }): Sender {
  const ownOrigin = browser.runtime.getURL('/');
  if (sender.url?.startsWith(ownOrigin)) return { kind: 'extension' };
  let site = null;
  try {
    site = siteForHost(new URL(sender.tab?.url ?? sender.url ?? '').hostname)?.id ?? null;
  } catch {
    site = null;
  }
  return { kind: 'page', site };
}

async function sweep(): Promise<void> {
  const now = Date.now();
  await sweepVault(now);
  await saveMeta({ lastVaultSweepAt: now }, now);
}

/** A red dot on the toolbar icon while MIRAGE is off, as a reminder. */
async function updateOffDot(): Promise<void> {
  const { enabled } = await loadSettings();
  await browser.action.setBadgeText({ text: enabled ? '' : ' ' });
  if (!enabled) await browser.action.setBadgeBackgroundColor({ color: '#dc2626' });
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async ({ reason }) => {
    await ensureDefaults();
    await browser.contextMenus.removeAll(); // an update keeps old menus; avoid a duplicate id
    browser.contextMenus.create({
      id: MENU_ALWAYS_HIDE,
      title: t('menu_alwaysHide'),
      contexts: ['selection'],
      documentUrlPatterns: [...ALL_MATCHES],
    });
    if (reason === 'install') await browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
    await updateOffDot();
  });

  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Only our own content scripts and pages may talk to the vault.
    if (sender.id !== browser.runtime.id) return false;
    void handleMessage(msg, Date.now(), senderOf(sender)).then(sendResponse);
    return true; // respond asynchronously
  });

  browser.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === MENU_ALWAYS_HIDE) void addAlwaysHide(info.selectionText);
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'settings' in changes) void updateOffDot();
  });

  // The 24-hour auto-clear: check every hour, and once when the worker starts.
  void browser.alarms.create(SWEEP_ALARM, { periodInMinutes: 60 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SWEEP_ALARM) void sweep();
  });
  void sweep();
  void updateOffDot();
});
