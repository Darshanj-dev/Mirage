// The popup (S7): one screen, no menus. Most people only ever use the on/off switch.

import { useState, type FormEvent } from 'react';
import { t, tCount } from '@/lib/strings';
import { usePopupState } from './usePopupState';

const REPO_URL = 'https://github.com/NinadPandith/Mirage';

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange(next: boolean): void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'switch--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__thumb" />
    </button>
  );
}

function ChipList({
  title,
  hint,
  items,
  onAdd,
  onRemove,
}: {
  title: string;
  hint: string;
  items: readonly string[];
  onAdd(value: string): Promise<void>;
  onRemove(value: string): Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    await onAdd(draft);
    setDraft('');
  };
  return (
    <section className="section">
      <h2 className="section__title">{title}</h2>
      <p className="section__hint">{hint}</p>
      {items.length > 0 && (
        <ul className="chips">
          {items.map((item) => (
            <li key={item} className="chip">
              <span>{item}</span>
              <button type="button" className="chip__remove" aria-label={t('popup_remove', [item])} onClick={() => void onRemove(item)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="add" onSubmit={(e) => void submit(e)}>
        <input
          className="add__input"
          value={draft}
          maxLength={60}
          placeholder={t('popup_addPlaceholder')}
          aria-label={`${title}: ${t('popup_addPlaceholder')}`}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn">
          {t('popup_add')}
        </button>
      </form>
    </section>
  );
}

export function PopupView() {
  const popup = usePopupState();
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState<number | null>(null);
  const { state } = popup;

  if (popup.error) {
    return (
      <main className="popup">
        <p className="status status--error">{t('error_check')}</p>
        <button type="button" className="btn" onClick={() => void popup.reload()}>
          {t('error_retry')}
        </button>
      </main>
    );
  }
  if (!state) return <main className="popup" aria-busy="true" />;

  const { settings, stats, site, host } = state;
  const status = !settings.enabled
    ? t('popup_paused')
    : site?.ready && host
      ? t('popup_status', [host])
      : t('popup_unsupported');

  return (
    <main className="popup">
      <header className="header">
        <div className="brand">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M12 2.5 4 5.5v6c0 5 3.4 8.9 8 10 4.6-1.1 8-5 8-10v-6l-8-3Z" />
          </svg>
          <span>MIRAGE</span>
        </div>
        <Switch
          checked={settings.enabled}
          label={settings.enabled ? t('popup_turnOff') : t('popup_turnOn')}
          onChange={(enabled) => void popup.setEnabled(enabled)}
        />
      </header>

      <p className={`status ${settings.enabled && site?.ready ? 'status--on' : ''}`}>{status}</p>
      {stats && <p className="week">{t('popup_week', [stats.week.hidden, stats.week.blocked])}</p>}

      <section className="section section--row">
        <div>
          <h2 className="section__title">{t('popup_quickMode')}</h2>
          <p className="section__hint">{t('popup_quickModeHint')}</p>
        </div>
        <Switch checked={settings.quickMode} label={t('popup_quickMode')} onChange={(on) => void popup.setQuickMode(on)} />
      </section>

      <ChipList
        title={t('popup_safeWords')}
        hint={t('popup_safeWordsHint')}
        items={settings.safeWords}
        onAdd={popup.addSafeWord}
        onRemove={popup.removeSafeWord}
      />
      <ChipList
        title={t('popup_alwaysHide')}
        hint={t('popup_alwaysHideHint')}
        items={state.alwaysMask}
        onAdd={popup.addAlwaysHide}
        onRemove={popup.removeAlwaysHide}
      />

      <section className="section">
        {confirmClear ? (
          <div className="confirm" role="alertdialog" aria-label={t('popup_clearConfirm')}>
            <p>{t('popup_clearConfirm')}</p>
            <div className="confirm__actions">
              <button type="button" className="btn" onClick={() => setConfirmClear(false)}>
                {t('preview_cancel')}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={async () => {
                  setCleared(await popup.clearVault());
                  setConfirmClear(false);
                }}
              >
                {t('popup_clearYes')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn--wide"
            onClick={() => {
              setCleared(null);
              setConfirmClear(true);
            }}
          >
            {t('popup_clear')}
          </button>
        )}
        {cleared !== null && <p className="section__hint">{tCount('popup_cleared', cleared)}</p>}
      </section>

      <footer className="footer">
        <span>{t('popup_footer')}</span>
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          {t('popup_repo')}
        </a>
      </footer>
    </main>
  );
}
