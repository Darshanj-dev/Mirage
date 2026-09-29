// Private Compose (side panel): the user writes the prompt in MIRAGE's own page, sees what will be
// hidden or removed, and inserts only the protected version into the chatbot. The draft lives in
// this panel's memory only: never stored, never written to the chatbot's page.

import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { detect } from '@/lib/detector/detect';
import { isMaskType, isSecretType, type DetectSettings, type MaskType } from '@/lib/detector/types';
import { sendMessage, type InsertProtectedResult } from '@/lib/messages';
import { assessRisk } from '@/lib/risk';
import { siteForHost, type SiteConfig } from '@/lib/sites';
import { findingLabel, levelName, t, tCount } from '@/lib/strings';
import { assignTokens, emptyTokenState, removedPlaceholder, replaceSpans } from '@/lib/tokenizer';
import { SHIELD_PATH } from './Controls';

const PLACEHOLDER = /(«[A-Z_]+(?:_\d+)?»)/;

function useTargetTab(): { tabId: number; site: SiteConfig } | null {
  const [target, setTarget] = useState<{ tabId: number; site: SiteConfig } | null>(null);
  useEffect(() => {
    const forced = Number(new URLSearchParams(location.search).get('tab')); // tests open the panel as a page
    const refresh = async () => {
      try {
        const tabs = forced ? [await browser.tabs.get(forced)] : await browser.tabs.query({ active: true, lastFocusedWindow: true });
        const tab = tabs[0];
        const site = tab?.url ? siteForHost(new URL(tab.url).hostname) : null;
        setTarget(tab?.id !== undefined && site ? { tabId: tab.id, site } : null);
      } catch {
        setTarget(null);
      }
    };
    void refresh();
    browser.tabs.onActivated.addListener(refresh);
    browser.tabs.onUpdated.addListener(refresh);
    return () => {
      browser.tabs.onActivated.removeListener(refresh);
      browser.tabs.onUpdated.removeListener(refresh);
    };
  }, []);
  return target;
}

export function ComposeView() {
  const target = useTargetTab();
  const [text, setText] = useState('');
  const [settings, setSettings] = useState<DetectSettings>({ safeWords: [], alwaysMask: [] });
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void sendMessage({ type: 'GET_SETTINGS' }).then((res) => {
      if (res.ok) setSettings({ safeWords: res.settings.safeWords, alwaysMask: res.alwaysMask, categories: res.settings.categories });
    });
  }, []);

  const findings = useMemo(() => (text ? detect(text, settings) : []), [text, settings]);
  const risk = useMemo(() => assessRisk(findings), [findings]);
  useEffect(() => setKeep(new Set()), [findings.length]);

  // Local preview; the real placeholders are assigned by MIRAGE when inserting (same scheme).
  const preview = useMemo(() => {
    const hide = findings.map((f, i) => ({ f, i })).filter(({ f, i }) => isMaskType(f.type) && !keep.has(i));
    const { tokens } = assignTokens(emptyTokenState(), hide.map(({ f }) => ({ type: f.type as MaskType, value: f.value })));
    return replaceSpans(
      text,
      findings.flatMap((f, i) => {
        if (keep.has(i)) return [];
        if (isSecretType(f.type)) return [{ start: f.start, end: f.end, text: removedPlaceholder(f.type, f.kind) }];
        const h = hide.findIndex((x) => x.i === i);
        return h >= 0 ? [{ start: f.start, end: f.end, text: tokens[h]! }] : [];
      }),
    );
  }, [text, findings, keep]);

  const actionable = findings.filter((f, i) => f.policy !== 'warn' && !keep.has(i)).length;

  const insert = async () => {
    if (!target || !text.trim()) return;
    setBusy(true);
    setStatus(null);
    let res: InsertProtectedResult | undefined;
    try {
      res = (await browser.tabs.sendMessage(target.tabId, { type: 'INSERT_PROTECTED', text, keep: [...keep] })) as InsertProtectedResult | undefined;
    } catch {
      res = undefined;
    }
    setBusy(false);
    if (res?.ok) {
      setText(''); // the draft is not kept once it has been inserted
      setStatus({ ok: true, text: t('compose_inserted', [target.site.name]) });
    } else {
      setStatus({ ok: false, text: t('compose_failed') });
    }
  };

  return (
    <main className="compose">
      <header className="header">
        <div className="brand">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={SHIELD_PATH} /></svg>
          <span>{t('compose_title')}</span>
        </div>
      </header>
      <p className="row__hint">{t('compose_lead')}</p>
      <textarea
        className="compose__input"
        value={text}
        autoFocus
        spellCheck
        placeholder={t('compose_placeholder')}
        aria-label={t('compose_placeholder')}
        onChange={(e) => { setText(e.target.value); setStatus(null); }}
      />

      {text && (
        <section className="compose__review" aria-live="polite">
          <div className="compose__summary">
            <span className={`level level--${risk.level}`}>{levelName(risk.level)} · {risk.score}</span>
            <span className="row__hint">{actionable ? tCount('compose_found', actionable) : t('compose_empty')}</span>
          </div>
          {findings.length > 0 && (
            <ul className="compose__items">
              {findings.map((f, i) => (
                <li key={`${f.start}-${f.end}`} className={`sev sev--${f.severity}${keep.has(i) ? ' is-kept' : ''}`}>
                  <span>{findingLabel(f)}</span>
                  {f.policy !== 'warn' ? (
                    <label className="keep">
                      <input
                        type="checkbox"
                        checked={!keep.has(i)}
                        onChange={() => { const k = new Set(keep); if (k.has(i)) k.delete(i); else k.add(i); setKeep(k); }}
                      />
                      {f.policy === 'block' ? t('review_remove') : t('review_hide')}
                    </label>
                  ) : (
                    <span className="row__hint">{t('review_warnHealth')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="label">{t('compose_preview', [target?.site.name ?? 'The AI'])}</p>
          <p className="compose__preview">
            {preview.split(PLACEHOLDER).map((part, i) =>
              PLACEHOLDER.test(part) ? <span key={i} className={`pill${part.endsWith('_REMOVED»') ? ' pill--secret' : ''}`}>{part}</span> : <span key={i}>{part}</span>,
            )}
          </p>
        </section>
      )}

      <p className="row__hint">{target ? t('compose_target', [target.site.name]) : t('compose_noTarget')}</p>
      <div className="compose__actions">
        <button type="button" className="btn" onClick={() => { setText(''); setStatus(null); }} disabled={!text}>{t('compose_clear')}</button>
        <button type="button" className="btn btn--primary" onClick={() => void insert()} disabled={!target || !text.trim() || busy}>
          {actionable ? t('compose_insert') : t('compose_insertClean')}
        </button>
      </div>
      {status && <p className={`compose__status ${status.ok ? 'is-ok' : 'is-error'}`} role="status">{status.text}</p>}
      <p className="local"><span className="local__dot" aria-hidden="true" />{t('compose_why')}</p>
    </main>
  );
}
