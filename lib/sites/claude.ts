import type { SiteConfig } from './types';

// claude.ai needs an account, so these selectors come from the public page structure and have
// not been checked by MIRAGE's test runs (verifiedOn: null). If none match, the fallback in
// index.ts still finds the prompt box, and the badge says protection is limited.
export const claude: SiteConfig = {
  id: 'claude',
  name: 'Claude',
  hosts: ['claude.ai'],
  promptBox: [
    'div.ProseMirror[contenteditable="true"]',
    '[data-testid="chat-input"][contenteditable="true"]',
    'fieldset [contenteditable="true"]',
  ],
  sendButton: ['button[aria-label="Send message"]', 'button[aria-label="Send Message"]', 'button[data-testid="send-button"]'],
  composer: ['fieldset', 'form'],
  conversation: ['[data-testid="user-message"]', '.font-claude-response', '[data-is-streaming]'],
  replyTurn: ['[data-is-streaming]'],
  replyContent: ['.font-claude-response', '[data-is-streaming] .standard-markdown'],
  replyCopyButton: [],
  chatIdFromPath: (path) =>
    /\/chat\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![0-9a-z-])/i.exec(path)?.[1]?.toLowerCase() ?? null,
  ready: true,
  verifiedOn: null,
};
