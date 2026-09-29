import type { SiteConfig } from './types';

// Taken from www.perplexity.ai signed out (2026-09-29). The prompt box is a Lexical editor;
// the send button appears as "Submit" once there is text.
export const perplexity: SiteConfig = {
  id: 'perplexity',
  name: 'Perplexity',
  hosts: ['www.perplexity.ai', 'perplexity.ai'],
  promptBox: ['#ask-input[contenteditable="true"]', 'div[data-lexical-editor="true"][contenteditable="true"]'],
  sendButton: ['button[aria-label="Submit"]', 'button[data-testid="submit-button"]'],
  composer: [], // no wrapping form: found from the send button
  conversation: ['[data-renderer="lm"]'],
  replyTurn: ['[data-workflow-final-text]'],
  replyContent: ['.prose[data-renderer="lm"]'],
  replyCopyButton: [],
  // /search/<id or slug>; new searches start at /.
  chatIdFromPath: (path) => /\/search\/([A-Za-z0-9._-]{8,200})/.exec(path)?.[1] ?? null,
  ready: true,
  verifiedOn: '2026-09-29',
};
