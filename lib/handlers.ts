// Message handlers. Runs in the service worker only (entrypoints/background.ts), which is
// the one part of MIRAGE allowed to touch the vault.

import { isAllowedFrom, isRequest, type Request, type Response, type ResultMap, type Sender, type SettingsPatch } from './messages';
import { loadMeta, loadSettings, loadStats, recordCounts, saveMeta, saveSettings, type Counts } from './settings';
import { MASK_TYPES } from './detector/types';
import { clearVault, loadAlwaysMask, previewTokens, renameChat, restore, saveAlwaysMask, tokenize } from './vault';

type AnyResponse = Response<Request['type']>;

const ok = <T extends Request['type']>(result: ResultMap[T]): Response<T> => ({ ok: true, ...result });

const COUNT_TYPES: readonly string[] = [...MASK_TYPES, 'SECRET'];

/** Keeps only numeric count fields for known types, so a COUNT message can never smuggle content into storage. */
function sanitizeDelta(delta: Partial<Counts>): Partial<Counts> {
  const out: Partial<Counts> = {};
  for (const key of ['checked', 'protectedSends', 'hidden', 'blocked', 'restoreFailures', 'allowOnce', 'replyWarnings'] as const) {
    const v = delta[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[key] = Math.floor(v);
  }
  if (delta.byType && typeof delta.byType === 'object') {
    const byType: Counts['byType'] = {};
    for (const [k, v] of Object.entries(delta.byType)) {
      if (COUNT_TYPES.includes(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        byType[k as keyof Counts['byType']] = Math.floor(v);
      }
    }
    out.byType = byType;
  }
  return out;
}

const ALLOWED_SETTING_KEYS = [
  'enabled',
  'quickMode',
  'protectedSendCount',
  'quickModeOffered',
  'safeWords',
  'awsNameCheck',
  'sites',
  'blockSecrets',
  'categories',
  'revealMode',
  'checkReplies',
] as const;

function pickSettings(patch: SettingsPatch): SettingsPatch {
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_SETTING_KEYS) if (key in patch) out[key] = patch[key];
  return out as SettingsPatch;
}

export async function handleMessage(
  msg: unknown,
  now: number = Date.now(),
  sender: Sender = { kind: 'extension' },
): Promise<AnyResponse> {
  if (!isRequest(msg)) return { ok: false, error: 'Unknown message' };
  if (!isAllowedFrom(sender, msg)) return { ok: false, error: `${msg.type} is not allowed from this page` };
  try {
    switch (msg.type) {
      case 'TOKENIZE':
        return ok<'TOKENIZE'>({ tokens: await tokenize(msg.site, msg.chatId, msg.findings, now) });
      case 'PREVIEW':
        return ok<'PREVIEW'>({ tokens: await previewTokens(msg.site, msg.chatId, msg.findings) });
      case 'RESTORE':
        return ok<'RESTORE'>(await restore(msg.site, msg.chatId, msg.tokens));
      case 'RENAME_CHAT':
        return ok<'RENAME_CHAT'>({ renamed: await renameChat(msg.site, msg.fromChatId, msg.toChatId, now) });
      case 'GET_SETTINGS':
        return ok<'GET_SETTINGS'>({
          settings: await loadSettings(),
          alwaysMask: await loadAlwaysMask(),
          firstRun: !(await loadMeta(now)).onboardingDone,
        });
      case 'SET_SETTINGS': {
        const settings = msg.settings ? await saveSettings(pickSettings(msg.settings)) : await loadSettings();
        const alwaysMask = msg.alwaysMask ? await saveAlwaysMask(msg.alwaysMask) : await loadAlwaysMask();
        return ok<'SET_SETTINGS'>({ settings, alwaysMask, firstRun: !(await loadMeta(now)).onboardingDone });
      }
      case 'ONBOARDING_DONE':
        await saveMeta({ onboardingDone: true }, now);
        return ok<'ONBOARDING_DONE'>({});
      case 'CLEAR_VAULT':
        return ok<'CLEAR_VAULT'>({ cleared: await clearVault() });
      case 'GET_STATS':
        return ok<'GET_STATS'>({ stats: await loadStats(now) });
      case 'COUNT':
        await recordCounts(sanitizeDelta(msg.delta), now);
        return ok<'COUNT'>({});
    }
  } catch (err) {
    // Only the error's kind is reported: its message could contain a value.
    const kind = err instanceof Error ? err.name : typeof err;
    return { ok: false, error: `MIRAGE could not handle ${msg.type} (${kind})` };
  }
}
