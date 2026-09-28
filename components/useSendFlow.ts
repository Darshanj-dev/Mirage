// What happens when the user presses Send (docs/app-flow.md, Main user flow):
//   nothing found -> sent as typed; personal details -> preview, then sent with placeholders;
//   secret -> blocked. Any error -> blocked with a message. Raw text is never sent silently.

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { detect } from '@/lib/detector/detect';
import { isSecretType, type Finding, type MaskType } from '@/lib/detector/types';
import { sendMessage } from '@/lib/messages';
import { currentChatId, markChatIdUsed } from '@/lib/page/chatId';
import { replaceInEditor, type EditorReplacement } from '@/lib/page/editor';
import { readPrompt } from '@/lib/page/promptText';
import type { SendGuard } from '@/lib/page/sendGuard';
import type { Counts } from '@/lib/settings';
import { findPromptBox, type SiteConfig } from '@/lib/sites';
import { t } from '@/lib/strings';
import { SECRET_REMOVED, replaceSpans } from '@/lib/tokenizer';
import type { PageSettings } from './usePromptWatcher';

export type Panel =
  | { kind: 'preview'; original: string; masked: string; replacements: EditorReplacement[]; hidden: Finding[] }
  | { kind: 'block'; text: string; findings: Finding[] }
  | { kind: 'error' }
  | { kind: 'confirmRaw'; back: Panel };

const QUICK_CHIP_MS = 2000;

/** Asks the AI to keep placeholders as they are, so they can be put back (PRD, Risks). */
const promptNote = () => ` ${t('prompt_note')}`;

function countsFor(findings: readonly Finding[]): Partial<Counts> {
  const byType: Counts['byType'] = {};
  for (const f of findings) {
    const key = isSecretType(f.type) ? 'SECRET' : f.type;
    byType[key] = (byType[key] ?? 0) + 1;
  }
  return { byType };
}

export function useSendFlow(
  site: SiteConfig,
  guard: SendGuard,
  settingsRef: MutableRefObject<PageSettings | null>,
  loadSettings: () => Promise<PageSettings | null>,
) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [chip, setChip] = useState<number | null>(null);
  const busy = useRef(false);
  const boxRef = useRef<HTMLElement | null>(null);

  const currentBox = useCallback(
    (): HTMLElement | null => (boxRef.current?.isConnected ? boxRef.current : findPromptBox(site)),
    [site],
  );

  /** Writes placeholders into the box, checks the result, then presses Send. */
  const sendMasked = useCallback(
    async (box: HTMLElement, preview: Extract<Panel, { kind: 'preview' }>): Promise<boolean> => {
      const note = promptNote();
      const ok = await replaceInEditor(
        box,
        [...preview.replacements, { start: preview.original.length, end: preview.original.length, expected: '', text: note }],
        preview.masked,
      );
      if (!ok || !(await guard.sendNow(box))) return false;

      const hidden = preview.hidden.length;
      void sendMessage({ type: 'COUNT', delta: { hidden, ...countsFor(preview.hidden) } });
      const count = settingsRef.current?.protectedSendCount ?? 0;
      void sendMessage({ type: 'SET_SETTINGS', settings: { protectedSendCount: count + 1 } });
      return true;
    },
    [guard, settingsRef],
  );

  const handleSend = useCallback(
    async (box: HTMLElement) => {
      if (busy.current) return;
      busy.current = true;
      boxRef.current = box;
      try {
        const settings = settingsRef.current ?? (await loadSettings());
        if (!settings) {
          setPanel({ kind: 'error' });
          return;
        }
        if (!settings.enabled) {
          if (!(await guard.sendNow(box))) setPanel({ kind: 'error' });
          return;
        }

        const { text } = readPrompt(box);
        const findings = detect(text, settings);
        const secrets = findings.filter((f) => f.policy === 'block');
        if (secrets.length > 0) {
          void sendMessage({ type: 'COUNT', delta: { blocked: secrets.length, ...countsFor(secrets) } });
          setPanel({ kind: 'block', text, findings });
          return;
        }

        const hidden = findings.filter((f) => f.policy === 'mask');
        if (hidden.length === 0) {
          setPanel(null);
          if (!(await guard.sendNow(box))) setPanel({ kind: 'error' });
          return;
        }

        const chatId = currentChatId(site);
        const res = await sendMessage({
          type: 'TOKENIZE',
          site: site.id,
          chatId,
          findings: hidden.map((f) => ({ type: f.type as MaskType, value: f.value })),
        });
        if (!res.ok || res.tokens.length !== hidden.length) {
          setPanel({ kind: 'error' });
          return;
        }
        markChatIdUsed(chatId);

        const replacements: EditorReplacement[] = hidden.map((f, i) => ({
          start: f.start,
          end: f.end,
          expected: f.value,
          text: res.tokens[i]!,
        }));
        const preview: Extract<Panel, { kind: 'preview' }> = {
          kind: 'preview',
          original: text,
          masked: replaceSpans(text, replacements) + promptNote(),
          replacements,
          hidden,
        };

        if (settings.quickMode) {
          setPanel(null);
          if (await sendMasked(box, preview)) {
            setChip(hidden.length);
          } else {
            setPanel({ kind: 'error' });
          }
          return;
        }
        setPanel(preview);
      } catch {
        setPanel({ kind: 'error' });
      } finally {
        busy.current = false;
      }
    },
    [guard, loadSettings, sendMasked, settingsRef, site],
  );

  // Every stopped send comes here; MIRAGE being off lets sends straight through.
  useEffect(() => {
    guard.setPassThrough(() => settingsRef.current?.enabled === false);
    guard.setHandler((box) => void handleSend(box));
    return () => guard.setHandler(null);
  }, [guard, handleSend, settingsRef]);

  useEffect(() => {
    if (chip === null) return;
    const timer = setTimeout(() => setChip(null), QUICK_CHIP_MS);
    return () => clearTimeout(timer);
  }, [chip]);

  const run = useCallback(
    async (task: (box: HTMLElement) => Promise<void>) => {
      const box = currentBox();
      if (!box || busy.current) return;
      busy.current = true;
      try {
        await task(box);
      } catch {
        setPanel({ kind: 'error' });
      } finally {
        busy.current = false;
      }
    },
    [currentBox],
  );

  const sendProtected = useCallback(() => {
    if (panel?.kind !== 'preview') return;
    const preview = panel;
    void run(async (box) => {
      // The user may have edited the prompt while the preview was open: check it again.
      if (readPrompt(box).text !== preview.original) {
        busy.current = false;
        await handleSend(box);
        return;
      }
      setPanel(null);
      if (!(await sendMasked(box, preview))) setPanel({ kind: 'error' });
    });
  }, [handleSend, panel, run, sendMasked]);

  const removeSecrets = useCallback(() => {
    if (panel?.kind !== 'block') return;
    const block = panel;
    void run(async (box) => {
      const secrets = block.findings.filter((f) => f.policy === 'block');
      const replacements = secrets.map((f) => ({ start: f.start, end: f.end, expected: f.value, text: SECRET_REMOVED }));
      const ok = await replaceInEditor(box, replacements, replaceSpans(block.text, replacements));
      if (!ok) {
        setPanel({ kind: 'error' });
        return;
      }
      busy.current = false;
      setPanel(null);
      await handleSend(box); // continues to the preview, or sends if nothing else was found
    });
  }, [handleSend, panel, run]);

  const close = useCallback(() => {
    setPanel(null);
    currentBox()?.focus();
  }, [currentBox]);

  const askSendRaw = useCallback(() => {
    if (panel && panel.kind !== 'confirmRaw' && panel.kind !== 'block') setPanel({ kind: 'confirmRaw', back: panel });
  }, [panel]);

  const confirmSendRaw = useCallback(() => {
    void run(async (box) => {
      setPanel(null);
      if (!(await guard.sendNow(box))) {
        setPanel({ kind: 'error' });
        return;
      }
      void sendMessage({ type: 'COUNT', delta: { allowOnce: 1 } });
    });
  }, [guard, run]);

  const retry = useCallback(() => {
    const box = currentBox();
    setPanel(null);
    if (box) void handleSend(box);
  }, [currentBox, handleSend]);

  const back = useCallback(() => {
    if (panel?.kind === 'confirmRaw') setPanel(panel.back);
  }, [panel]);

  return { panel, chip, sendProtected, removeSecrets, close, askSendRaw, confirmSendRaw, retry, back };
}
