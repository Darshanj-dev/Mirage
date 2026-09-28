// The chat id for vault records: from the URL, or a temporary id for a new, unsaved chat.
// Once the site gives the new chat a real URL, the vault record is renamed to it
// (docs/schema.md, Key naming).

import { sendMessage } from '../messages';
import type { SiteConfig } from '../sites';

let tempId: string | null = null;
let tempUsed = false; // true once a send stored values under the temporary id
let renaming: Promise<void> | null = null;
const renamedListeners = new Set<() => void>();

/**
 * A trail of chat-id events (ids, paths and outcomes only, never values), readable from the
 * DevTools console in MIRAGE's content-script context as `__mirageChatIdTrail`.
 */
const trail: string[] = [];
function note(event: string): void {
  trail.push(`${new Date().toISOString().slice(11, 23)} ${event}`);
  if (trail.length > 60) trail.shift();
}
(globalThis as { __mirageChatIdTrail?: string[] }).__mirageChatIdTrail = trail;

/** Called after a new chat's values have moved to its real id, so the page can look again. */
export function onChatRenamed(listener: () => void): () => void {
  renamedListeners.add(listener);
  return () => renamedListeners.delete(listener);
}

/** The id to use right now (sync). New chats get a temporary id. */
export function currentChatId(site: SiteConfig, path: string = location.pathname): string {
  const fromUrl = site.chatIdFromPath(path);
  if (fromUrl) return fromUrl;
  if (!tempId) {
    tempId = `new-${crypto.randomUUID()}`;
    note(`temp created ${tempId} at ${path}`);
  }
  return tempId;
}

/** Call after TOKENIZE used `chatId`, so a temporary id is renamed once the URL has a real one. */
export function markChatIdUsed(chatId: string): void {
  note(`used ${chatId} (temp=${tempId}) at ${location.pathname}`);
  if (chatId === tempId) tempUsed = true;
}

/**
 * The id to read values from. If a new chat has just received its real URL, its record is
 * renamed first, so replies in that chat find their values.
 */
export async function resolveChatId(site: SiteConfig): Promise<string> {
  const fromUrl = site.chatIdFromPath(location.pathname);
  if (fromUrl && tempId && tempUsed) {
    const from = tempId;
    renaming ??= sendMessage({ type: 'RENAME_CHAT', site: site.id, fromChatId: from, toChatId: fromUrl })
      .then((res) => {
        note(`rename ${from} -> ${fromUrl}: ${res.ok ? `ok renamed=${res.renamed}` : `failed ${res.error}`}`);
        // Only forget the temporary id once the service worker has moved (or merged) its values;
        // otherwise try again on the next check.
        if (res.ok && tempId === from) {
          tempId = null;
          tempUsed = false;
          renamedListeners.forEach((listener) => listener());
        }
      })
      .finally(() => {
        renaming = null;
      });
    await renaming;
  } else if (fromUrl && tempId && !tempUsed) {
    note(`temp dropped unused ${tempId} at ${location.pathname}`);
    tempId = null; // left a new chat without sending anything
  }
  return fromUrl ?? currentChatId(site);
}
