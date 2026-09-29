// What happens when the user presses Send (docs/app-flow.md, Main user flow):
//   nothing to hide -> sent as typed; anything found -> review panel (risk, items, what the AI
//   will see) -> Protect & send, Edit prompt, or Send anyway (a secret needs a second confirm,
//   and can't be sent at all while Block secrets is on). Quick mode skips the panel for personal
//   details only. Any error -> blocked with a message. The prompt is never changed silently.

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { detect } from '@/lib/detector/detect';
import { isMaskType, isSecretType, type Finding, type MaskType } from '@/lib/detector/types';
import { sendMessage } from '@/lib/messages';
import { currentChatId, markChatIdUsed } from '@/lib/page/chatId';
import { replaceInEditor, type EditorReplacement } from '@/lib/page/editor';
import { readPrompt } from '@/lib/page/promptText';
import type { SendGuard } from '@/lib/page/sendGuard';
import { assessRisk, type Risk } from '@/lib/risk';
import type { Counts } from '@/lib/settings';
import { findPromptBox, type SiteConfig } from '@/lib/sites';
import { t } from '@/lib/strings';
import { removedPlaceholder, replaceSpans } from '@/lib/tokenizer';
import type { PageSettings } from './usePromptWatcher';

export interface ReviewState {
  kind: 'review';
  text: string;
  findings: Finding[];
  risk: Risk;
  /** Placeholder each finding would get (null for warnings; removed-secret label for secrets). */
  tokens: (string | null)[];
  /** Indexes of findings the user chose to send as typed. */
  keep: ReadonlySet<number>;
}

export type FlowPanel = ReviewState | { kind: 'error' } | { kind: 'confirmRaw'; back: ReviewState } | { kind: 'confirmSecret'; back: ReviewState };

const QUICK_CHIP_MS = 2000;

/** Asks the AI to keep placeholders as they are, so they can be put back (PRD, Risks). */
const promptNote = () => ` ${t('prompt_note')}`;

function countsFor(findings: readonly Finding[]): Partial<Counts> {
  const byType: Counts['byType'] = {};
  for (const f of findings) {
    if (!isSecretType(f.type) && !isMaskType(f.type)) continue;
    const key = isSecretType(f.type) ? 'SECRET' : f.type;
    byType[key] = (byType[key] ?? 0) + 1;
  }
  return { byType };
}

/** The prompt exactly as it will be sent, given the placeholders and what the user keeps. */
export function protectedText(review: Pick<ReviewState, 'text' | 'findings' | 'tokens' | 'keep'>): {
  text: string;
  replacements: EditorReplacement[];
} {
  const replacements: EditorReplacement[] = [];
  review.findings.forEach((f, i) => {
    const token = review.tokens[i];
    if (f.policy === 'warn' || review.keep.has(i) || !token) return;
    replacements.push({ start: f.start, end: f.end, expected: f.value, text: token });
  });
  const hasPlaceholders = review.findings.some((f, i) => f.policy === 'mask' && !review.keep.has(i));
  const note = hasPlaceholders ? promptNote() : '';
  if (note) replacements.push({ start: review.text.length, end: review.text.length, expected: '', text: note });
  return { text: replaceSpans(review.text, replacements), replacements };
}

export function useSendFlow(
  site: SiteConfig,
  guard: SendGuard,
  settingsRef: MutableRefObject<PageSettings | null>,
  loadSettings: () => Promise<PageSettings | null>,
) {
  const [panel, setPanel] = useState<FlowPanel | null>(null);
  const [chip, setChip] = useState<number | null>(null);
  const busy = useRef(false);
  const boxRef = useRef<HTMLElement | null>(null);

  const currentBox = useCallback(
    (): HTMLElement | null => (boxRef.current?.isConnected ? boxRef.current : findPromptBox(site)),
    [site],
  );

  /** Saves placeholders for what is hidden, writes the protected prompt into the box, presses Send. */
  const sendProtectedNow = useCallback(
    async (box: HTMLElement, review: ReviewState): Promise<boolean> => {
      const hide = review.findings.map((f, i) => ({ f, i })).filter(({ f, i }) => f.policy === 'mask' && !review.keep.has(i));
      const tokens = [...review.tokens];
      if (hide.length > 0) {
        const chatId = currentChatId(site);
        const res = await sendMessage({
          type: 'TOKENIZE',
          site: site.id,
          chatId,
          findings: hide.map(({ f }) => ({ type: f.type as MaskType, value: f.value })),
        });
        if (!res.ok || res.tokens.length !== hide.length) return false;
        markChatIdUsed(chatId);
        hide.forEach(({ i }, n) => (tokens[i] = res.tokens[n]!));
      }
      const out = protectedText({ ...review, tokens });
      if (out.replacements.length > 0 && !(await replaceInEditor(box, out.replacements, out.text))) return false;
      if (!(await guard.sendNow(box))) return false;

      const removed = review.findings.filter((f, i) => f.policy === 'block' && !review.keep.has(i));
      const hidden = hide.map(({ f }) => f);
      void sendMessage({
        type: 'COUNT',
        delta: {
          checked: 1,
          protectedSends: hidden.length + removed.length > 0 ? 1 : 0,
          hidden: hidden.length,
          blocked: removed.length,
          allowOnce: review.keep.size > 0 ? 1 : 0,
          ...countsFor([...hidden, ...removed]),
        },
      });
      const count = settingsRef.current?.protectedSendCount ?? 0;
      void sendMessage({ type: 'SET_SETTINGS', settings: { protectedSendCount: count + 1 } });
      return true;
    },
    [guard, settingsRef, site],
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
        const actionable = findings.filter((f) => f.policy !== 'warn');
        if (actionable.length === 0) {
          // Nothing to hide (health details alone are kept): send as typed, stay invisible.
          setPanel(null);
          if (!(await guard.sendNow(box))) {
            setPanel({ kind: 'error' });
            return;
          }
          void sendMessage({ type: 'COUNT', delta: { checked: 1 } });
          return;
        }

        // Placeholders the send would use, without saving anything yet.
        const maskIdx = findings.map((f, i) => (isMaskType(f.type) ? i : -1)).filter((i) => i >= 0);
        const tokens: (string | null)[] = findings.map((f) =>
          isSecretType(f.type) ? removedPlaceholder(f.type, f.kind) : null,
        );
        if (maskIdx.length > 0) {
          const res = await sendMessage({
            type: 'PREVIEW',
            site: site.id,
            chatId: currentChatId(site),
            findings: maskIdx.map((i) => ({ type: findings[i]!.type as MaskType, value: findings[i]!.value })),
          });
          if (!res.ok || res.tokens.length !== maskIdx.length) {
            setPanel({ kind: 'error' });
            return;
          }
          maskIdx.forEach((i, n) => (tokens[i] = res.tokens[n]!));
        }
        const review: ReviewState = { kind: 'review', text, findings, risk: assessRisk(findings), tokens, keep: new Set() };

        const hasSecret = findings.some((f) => f.policy === 'block');
        if (settings.quickMode && !hasSecret) {
          setPanel(null);
          if (await sendProtectedNow(box, review)) setChip(maskIdx.length);
          else setPanel({ kind: 'error' });
          return;
        }
        setPanel(review);
      } catch {
        setPanel({ kind: 'error' });
      } finally {
        busy.current = false;
      }
    },
    [guard, loadSettings, sendProtectedNow, settingsRef, site],
  );

  // Every stopped send comes here; MIRAGE being off (here) lets sends straight through, and so
  // does a prompt with nothing to hide (checked synchronously, in a few milliseconds).
  useEffect(() => {
    guard.setPassThrough(() => settingsRef.current?.enabled === false);
    guard.setIsClean((box) => {
      const settings = settingsRef.current;
      if (!settings || busy.current || panel) return false;
      const clean = detect(readPrompt(box).text, settings).every((f) => f.policy === 'warn');
      if (clean) void sendMessage({ type: 'COUNT', delta: { checked: 1 } });
      return clean;
    });
    guard.setHandler((box) => void handleSend(box));
    return () => {
      guard.setHandler(null);
      guard.setIsClean(null);
    };
  }, [guard, handleSend, settingsRef, panel]);

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

  /** Protect & send: hide what is marked Hide, remove secrets, send. */
  const protect = useCallback(() => {
    if (panel?.kind !== 'review') return;
    const review = panel;
    void run(async (box) => {
      // The user may have edited the prompt while the panel was open: check it again.
      if (readPrompt(box).text !== review.text) {
        busy.current = false;
        await handleSend(box);
        return;
      }
      setPanel(null);
      if (!(await sendProtectedNow(box, review))) setPanel({ kind: 'error' });
    });
  }, [handleSend, panel, run, sendProtectedNow]);

  /** Review: flip one item between Hide/Remove and Keep. Secrets stay removed while Block secrets is on. */
  const toggleKeep = useCallback(
    (index: number) => {
      if (panel?.kind !== 'review') return;
      const f = panel.findings[index];
      if (!f || f.policy === 'warn') return;
      if (f.policy === 'block' && settingsRef.current?.blockSecrets !== false) return;
      const keep = new Set(panel.keep);
      if (keep.has(index)) keep.delete(index);
      else keep.add(index);
      setPanel({ ...panel, keep });
    },
    [panel, settingsRef],
  );

  const close = useCallback(() => {
    setPanel(null);
    currentBox()?.focus();
  }, [currentBox]);

  /** Send anyway: a confirm first; for a secret a stronger one, and never while Block secrets is on. */
  const askSendRaw = useCallback(() => {
    if (panel?.kind !== 'review') return;
    const hasSecret = panel.findings.some((f) => f.policy === 'block');
    if (hasSecret && settingsRef.current?.blockSecrets !== false) return;
    setPanel(hasSecret ? { kind: 'confirmSecret', back: panel } : { kind: 'confirmRaw', back: panel });
  }, [panel, settingsRef]);

  const confirmSendRaw = useCallback(() => {
    void run(async (box) => {
      setPanel(null);
      if (!(await guard.sendNow(box))) {
        setPanel({ kind: 'error' });
        return;
      }
      void sendMessage({ type: 'COUNT', delta: { checked: 1, allowOnce: 1 } });
    });
  }, [guard, run]);

  const retry = useCallback(() => {
    const box = currentBox();
    setPanel(null);
    if (box) void handleSend(box);
  }, [currentBox, handleSend]);

  const back = useCallback(() => {
    if (panel?.kind === 'confirmRaw' || panel?.kind === 'confirmSecret') setPanel(panel.back);
  }, [panel]);

  return { panel, chip, protect, toggleKeep, close, askSendRaw, confirmSendRaw, retry, back };
}
