import type { SiteConfig } from './types';

const UUID = String.raw`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`;

// Two layouts, both checked on chatgpt.com: the signed-in ProseMirror composer (DevTools,
// 2026-09-28) and the signed-out textarea composer (automated run, 2026-09-29).
export const chatgpt: SiteConfig = {
  id: 'chatgpt',
  name: 'ChatGPT',
  hosts: ['chatgpt.com'],
  promptBox: [
    '#prompt-textarea[contenteditable="true"]',
    'form .ProseMirror[contenteditable="true"]',
    'textarea#mobile-composer-prompt',
    'form[data-mobile-composer] textarea[name="prompt"]',
  ],
  // While a reply streams the send button becomes the stop button; isSendButton() skips it.
  sendButton: ['button[data-testid="send-button"]', '#composer-submit-button', 'button[data-composer-submit]'],
  composer: ['form'],
  conversation: [
    '[data-message-author-role]',
    'li[data-message-role]',
    'section[data-testid^="conversation-turn-"]',
    'article[data-testid^="conversation-turn-"]',
  ],
  replyTurn: [
    'section[data-testid^="conversation-turn-"]:has([data-message-author-role="assistant"])',
    'li[data-message-role="assistant"]',
  ],
  replyContent: ['[data-message-author-role="assistant"]', 'li[data-message-role="assistant"] [data-assistant-markdown]'],
  replyCopyButton: ['button[data-testid="copy-turn-action-button"]'],
  // /c/<uuid>, /g/<gpt>/c/<uuid> inside a custom GPT, or /uc/<uuid> when signed out. Only a full
  // UUID counts: right after the first send ChatGPT briefly shows /c/WEB:<client id>.
  chatIdFromPath: (path) =>
    new RegExp(String.raw`\/u?c\/(${UUID})(?![0-9a-z:-])`, 'i').exec(path)?.[1]?.toLowerCase() ?? null,
  ready: true,
  verifiedOn: '2026-09-29',
};
