// S8 welcome page: a 30-second demo that runs entirely in this page. Nothing is sent anywhere.
// It uses MIRAGE's real detector and tokenizer on a fictional sample prompt.

import { useMemo, useState, type ReactNode } from 'react';
import { detect } from '@/lib/detector/detect';
import { isSecretType, type MaskType } from '@/lib/detector/types';
import { t } from '@/lib/strings';
import { TOKEN_PATTERN, assignTokens, emptyTokenState, lookupTokens, replaceSpans } from '@/lib/tokenizer';

type Step = 'type' | 'receive' | 'reply';

/** Splits text into plain parts and marked parts. */
function mark(text: string, spans: readonly { start: number; end: number }[], render: (part: string, i: number) => ReactNode) {
  const out: ReactNode[] = [];
  let last = 0;
  spans.forEach((s, i) => {
    out.push(text.slice(last, s.start));
    out.push(render(text.slice(s.start, s.end), i));
    last = s.end;
  });
  out.push(text.slice(last));
  return out;
}

export function WelcomeView() {
  const [step, setStep] = useState<Step>('type');

  const demo = useMemo(() => {
    const prompt = t('welcome_samplePrompt');
    const findings = detect(prompt, { safeWords: [], alwaysMask: [t('welcome_sampleName')] }).filter(
      (f) => !isSecretType(f.type),
    );
    const { state, tokens } = assignTokens(
      emptyTokenState(),
      findings.map((f) => ({ type: f.type as MaskType, value: f.value })),
    );
    const masked = replaceSpans(
      prompt,
      findings.map((f, i) => ({ start: f.start, end: f.end, text: tokens[i]! })),
    );
    const reply = t('welcome_sampleReply');
    const values = lookupTokens(state, [...reply.matchAll(TOKEN_PATTERN)].map((m) => m[0]));
    return { prompt, findings, tokens, masked, reply, values };
  }, []);

  const maskedSpans = [...demo.masked.matchAll(TOKEN_PATTERN)].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));

  // The reply as the user sees it: placeholders put back, remembered for the dotted underline.
  let restoredText = '';
  const restoredSpans: { start: number; end: number; token: string }[] = [];
  let last = 0;
  for (const m of demo.reply.matchAll(TOKEN_PATTERN)) {
    restoredText += demo.reply.slice(last, m.index);
    const value = demo.values[m[0]] ?? m[0];
    restoredSpans.push({ start: restoredText.length, end: restoredText.length + value.length, token: m[0] });
    restoredText += value;
    last = (m.index ?? 0) + m[0].length;
  }
  restoredText += demo.reply.slice(last);

  return (
    <main className="welcome">
      <header className="welcome__header">
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <path d="M12 2.5 4 5.5v6c0 5 3.4 8.9 8 10 4.6-1.1 8-5 8-10v-6l-8-3Z" />
        </svg>
        <span>MIRAGE</span>
      </header>

      <h1 className="welcome__headline">{t('welcome_headline')}</h1>

      <ol className="steps" aria-label={t('welcome_title')}>
        <li className="step step--done">
          <h2 className="step__label">{t('welcome_youType')}</h2>
          <p className="bubble bubble--user">
            {mark(demo.prompt, demo.findings, (part, i) => (
              <span key={i} className="hl" title={t('highlight_hover', [demo.tokens[i] ?? ''])}>
                {part}
              </span>
            ))}
          </p>
          {step === 'type' && (
            <button type="button" className="btn btn--primary" onClick={() => setStep('receive')}>
              {t('welcome_seeAi')}
            </button>
          )}
        </li>

        {step !== 'type' && (
          <li className="step">
            <h2 className="step__label">{t('welcome_aiReceives')}</h2>
            <p className="bubble bubble--user bubble--masked">
              {mark(demo.masked, maskedSpans, (part, i) => (
                <span key={i} className="pill">
                  {part}
                </span>
              ))}
            </p>
            {step === 'receive' && (
              <button type="button" className="btn btn--primary" onClick={() => setStep('reply')}>
                {t('welcome_seeReply')}
              </button>
            )}
          </li>
        )}

        {step === 'reply' && (
          <li className="step">
            <h2 className="step__label">{t('welcome_youSee')}</h2>
            <p className="bubble bubble--ai">
              {mark(restoredText, restoredSpans, (part, i) => (
                <span key={i} className="restored">
                  {part}
                  {i === 0 && (
                    <span className="tip" role="note">
                      {t('restore_hover', ['ChatGPT', restoredSpans[i]!.token])}
                    </span>
                  )}
                </span>
              ))}
            </p>
          </li>
        )}
      </ol>

      {step === 'reply' && (
        <section className="done">
          <h2 className="done__title">{t('welcome_done')}</h2>
          <p className="done__pin">
            {t('welcome_pin')} <span className="puzzle" aria-hidden="true">🧩</span>
          </p>
          <div className="done__actions">
            <a className="btn btn--primary" href="https://chatgpt.com/" target="_blank" rel="noreferrer">
              {t('welcome_openChatGPT')}
            </a>
            <a className="btn" href="https://gemini.google.com/" target="_blank" rel="noreferrer">
              {t('welcome_openGemini')}
            </a>
            <button type="button" className="btn btn--link" onClick={() => setStep('type')}>
              {t('welcome_startAgain')}
            </button>
          </div>
        </section>
      )}

      <p className="fictional">{t('welcome_fictional')}</p>
    </main>
  );
}
