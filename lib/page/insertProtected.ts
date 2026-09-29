// Private Compose, page side: the prompt arrives from MIRAGE's own panel (never from the page),
// is protected here in MIRAGE's content script, and only the protected version is written into
// the chatbot's prompt box. The user then reviews it and presses Send themselves.

import { detect } from '../detector/detect';
import { isMaskType, isSecretType, type DetectSettings, type MaskType } from '../detector/types';
import { sendMessage, type InsertProtectedResult } from '../messages';
import { findPromptBox, type SiteConfig } from '../sites';
import { t } from '../strings';
import { removedPlaceholder, replaceSpans } from '../tokenizer';
import { currentChatId, markChatIdUsed } from './chatId';
import { readPrompt } from './promptText';

const normalize = (s: string) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const nextFrame = () => new Promise<void>((r) => { const t0 = setTimeout(r, 50); requestAnimationFrame(() => { clearTimeout(t0); r(); }); });

/** Replaces everything in the prompt box with `text`, as typing would, and checks the result. */
export async function setPromptText(box: HTMLElement, text: string): Promise<boolean> {
  box.focus();
  if (box instanceof HTMLTextAreaElement) {
    box.select();
    if (!document.execCommand('insertText', false, text)) return false;
  } else {
    document.execCommand('selectAll');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) document.execCommand('insertParagraph');
      if (lines[i]) document.execCommand('insertText', false, lines[i]);
      else if (i === 0) document.execCommand('delete');
    }
  }
  for (let i = 0; i < 10; i++) {
    await nextFrame();
    if (normalize(readPrompt(box).text) === normalize(text)) return true;
  }
  return false;
}

export async function insertProtected(site: SiteConfig, text: string, keep: readonly number[], settings: DetectSettings): Promise<InsertProtectedResult> {
  const box = findPromptBox(site);
  if (!box) return { ok: false, error: 'noPromptBox' };
  const findings = detect(text, settings);
  const kept = new Set(keep);
  const hide = findings.map((f, i) => ({ f, i })).filter(({ f, i }) => isMaskType(f.type) && !kept.has(i));
  let tokens: string[] = [];
  if (hide.length > 0) {
    const chatId = currentChatId(site);
    const res = await sendMessage({ type: 'TOKENIZE', site: site.id, chatId, findings: hide.map(({ f }) => ({ type: f.type as MaskType, value: f.value })) });
    if (!res.ok || res.tokens.length !== hide.length) return { ok: false, error: 'tokenizeFailed' };
    markChatIdUsed(chatId);
    tokens = res.tokens;
  }
  let removed = 0;
  const replacements = findings.flatMap((f, i) => {
    if (kept.has(i)) return [];
    if (isSecretType(f.type)) {
      removed++;
      return [{ start: f.start, end: f.end, text: removedPlaceholder(f.type, f.kind) }];
    }
    const h = hide.findIndex((x) => x.i === i);
    return h >= 0 ? [{ start: f.start, end: f.end, text: tokens[h]! }] : [];
  });
  const protectedText = replaceSpans(text, replacements) + (hide.length > 0 ? ` ${t('prompt_note')}` : '');
  if (!(await setPromptText(box, protectedText))) return { ok: false, error: 'writeFailed' };
  return { ok: true, hidden: hide.length, removed };
}
