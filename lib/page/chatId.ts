// The chat id for vault records: from the URL, or a temporary id for a new, unsaved chat
// (renamed to the real id once the URL has one; docs/schema.md, Key naming).

import type { SiteConfig } from '../sites';

let tempId: string | null = null;

export function currentChatId(site: SiteConfig, path: string = location.pathname): string {
  const fromUrl = site.chatIdFromPath(path);
  if (fromUrl) return fromUrl;
  tempId ??= `new-${crypto.randomUUID()}`;
  return tempId;
}

/** The temporary id in use, if any. Cleared once it has been renamed to a real id. */
export function pendingTempId(): string | null {
  return tempId;
}

export function forgetTempId(): void {
  tempId = null;
}
