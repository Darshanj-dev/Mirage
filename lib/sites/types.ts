// A platform adapter: everything MIRAGE needs to know about one chatbot's page. Only
// selectors and URL shapes live here; the protection logic is the same for every site, so a
// redesign of one site is a one-file fix that cannot break the others.

import type { Site } from './hosts';

export interface SiteConfig {
  id: Site;
  name: string; // shown to the user, e.g. "ChatGPT will see this"
  hosts: readonly string[];
  /** Tried in order; the first visible match is the prompt box. */
  promptBox: readonly string[];
  /** Tried in order, first inside the composer, then in the whole page. */
  sendButton: readonly string[];
  /** The element that wraps the prompt box and its buttons. Empty: found from the send button. */
  composer: readonly string[];
  /**
   * Messages in the conversation (both sides). Real details are only put back inside these,
   * and an editable box inside one is an "edit message" box that MIRAGE also guards.
   */
  conversation: readonly string[];
  /** One AI reply with its action buttons; empty where not yet known ("Copy with details" is off). */
  replyTurn: readonly string[];
  /** The reply's own text: what the reply check reads. */
  replyContent: readonly string[];
  /** The site's copy button inside a reply turn; "Copy with details" goes right after it. */
  replyCopyButton: readonly string[];
  /** Conversation id from the URL path, or null for a new, unsaved chat. */
  chatIdFromPath(path: string): string | null;
  /** False turns MIRAGE off on this site entirely. */
  ready: boolean;
  /**
   * The date selectors were last checked against the live site, or null if they come from
   * public documentation only (the site needs an account MIRAGE's test runs don't have).
   */
  verifiedOn: string | null;
}
