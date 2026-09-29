import type { SiteConfig } from './types';

// copilot.microsoft.com asks for sign-in before the composer appears, so these selectors are
// not yet checked by MIRAGE's test runs (verifiedOn: null); the fallback in index.ts covers
// a composer they miss.
export const copilot: SiteConfig = {
  id: 'copilot',
  name: 'Copilot',
  hosts: ['copilot.microsoft.com'],
  promptBox: ['textarea#userInput', 'textarea[data-testid="composer-input"]', 'textarea[placeholder*="Copilot" i]'],
  sendButton: ['button[data-testid="submit-button"]', 'button[aria-label="Submit message"]', 'button[title="Submit message"]'],
  composer: ['form', '[data-testid="composer"]'],
  conversation: ['[data-content="user-message"]', '[data-content="ai-message"]'],
  replyTurn: ['[data-content="ai-message"]'],
  replyContent: ['[data-content="ai-message"]'],
  replyCopyButton: [],
  chatIdFromPath: (path) => /\/chats\/([A-Za-z0-9_-]{6,})/.exec(path)?.[1] ?? null,
  ready: true,
  verifiedOn: null,
};
