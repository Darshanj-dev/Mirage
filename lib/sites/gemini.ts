import type { SiteConfig } from './types';

// Taken from gemini.google.com (DevTools 2026-09-28; replies from an automated run 2026-09-29).
// The prompt box is a Quill editor inside <rich-textarea>; Quill also keeps a hidden
// .ql-clipboard editable, which is never used.
export const gemini: SiteConfig = {
  id: 'gemini',
  name: 'Gemini',
  hosts: ['gemini.google.com'],
  promptBox: ['rich-textarea .ql-editor[contenteditable="true"]', '.ql-editor.new-input-ui[contenteditable="true"]'],
  // While a reply streams the button becomes "Stop response"; isSendButton() skips it.
  sendButton: ['button[aria-label="Send message"]', 'button.send-button'],
  composer: ['.input-area-container', 'input-area-v2', 'fieldset', '.text-input-field', 'rich-textarea'],
  conversation: ['user-query-content', 'user-query', 'model-response', 'message-content'],
  replyTurn: ['model-response'],
  replyContent: ['message-content .markdown', 'model-response message-content'],
  replyCopyButton: [], // not yet taken from gemini.google.com
  // /app/<16 hex>, also under /u/<n>/app/<id> for a second Google account. New chats are /app.
  chatIdFromPath: (path) => /\/app\/([0-9a-f]{12,})(?![0-9a-z:_-])/i.exec(path)?.[1]?.toLowerCase() ?? null,
  ready: true,
  verifiedOn: '2026-09-29',
};
