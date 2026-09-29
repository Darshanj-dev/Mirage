// The settings page: protection, what MIRAGE looks for, platforms, words, and a plain account
// of what is stored and what never leaves the device.

import { useState } from 'react';
import { CATEGORIES } from '@/lib/detector/taxonomy';
import { SITES } from '@/lib/sites';
import { SITE_IDS } from '@/lib/sites/hosts';
import { t, tCount } from '@/lib/strings';
import { ChipList, Row, SHIELD_PATH, Switch } from './Controls';
import { usePopupState } from './usePopupState';

export function SettingsView() {
  const popup = usePopupState();
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState<number | null>(null);
  const { state } = popup;
  if (popup.error) return <main className="settings"><p>{t('error_check')}</p></main>;
  if (!state) return <main className="settings" aria-busy="true" />;
  const { settings } = state;
  const save = popup.save;

  return (
    <main className="settings">
      <header className="settings__head">
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d={SHIELD_PATH} /></svg>
        <h1>{t('settings_title')}</h1>
      </header>

      <section className="card">
        <h2>{t('settings_protection')}</h2>
        <Row title={t('settings_enabled')} hint={t('settings_enabledHint')}>
          <Switch checked={settings.enabled} label={t('settings_enabled')} onChange={(v) => void save({ enabled: v })} />
        </Row>
        <div className="row">
          <div className="row__text">
            <p className="row__title">{t('settings_mode')}</p>
            <p className="row__hint">{settings.quickMode ? t('settings_modeAutoHint') : t('settings_modeReviewHint')}</p>
          </div>
          <div className="segmented" role="radiogroup" aria-label={t('settings_mode')}>
            <button type="button" role="radio" aria-checked={!settings.quickMode} onClick={() => void save({ quickMode: false })}>
              {t('settings_modeReview')}
            </button>
            <button type="button" role="radio" aria-checked={settings.quickMode} onClick={() => void save({ quickMode: true })}>
              {t('settings_modeAuto')}
            </button>
          </div>
        </div>
        <Row title={t('settings_blockSecrets')} hint={t('settings_blockSecretsHint')}>
          <Switch checked={settings.blockSecrets} label={t('settings_blockSecrets')} onChange={(v) => void save({ blockSecrets: v })} />
        </Row>
        <Row title={t('settings_checkReplies')} hint={t('settings_checkRepliesHint')}>
          <Switch checked={settings.checkReplies} label={t('settings_checkReplies')} onChange={(v) => void save({ checkReplies: v })} />
        </Row>
        <Row title={t('settings_reveal')} hint={t('settings_revealHint')}>
          <Switch
            checked={settings.revealMode === 'inline'}
            label={t('settings_reveal')}
            onChange={(v) => void save({ revealMode: v ? 'inline' : 'hover' })}
          />
        </Row>
      </section>

      <section className="card">
        <h2>{t('settings_detection')}</h2>
        {CATEGORIES.map((c) => (
          <Row key={c} title={t(`cat_${c}`)} hint={settings.categories[c] ? t(`cat_${c}Hint`) : t('settings_catOffWarn')}>
            <Switch
              checked={settings.categories[c]}
              label={t(`cat_${c}`)}
              onChange={(v) => void save({ categories: { ...settings.categories, [c]: v } })}
            />
          </Row>
        ))}
      </section>

      <section className="card">
        <h2>{t('settings_platforms')}</h2>
        {SITE_IDS.map((id) => (
          <Row key={id} title={SITES[id].name} hint={SITES[id].verifiedOn ? SITES[id].hosts[0] : `${SITES[id].hosts[0]} · ${t('popup_beta')}`}>
            <Switch
              checked={settings.sites[id]}
              label={SITES[id].name}
              onChange={(v) => void save({ sites: { ...settings.sites, [id]: v } })}
            />
          </Row>
        ))}
      </section>

      <section className="card">
        <h2>{t('settings_words')}</h2>
        <ChipList title={t('popup_alwaysHide')} hint={t('popup_alwaysHideHint')} items={state.alwaysMask} onAdd={popup.addAlwaysHide} onRemove={popup.removeAlwaysHide} />
        <ChipList title={t('popup_safeWords')} hint={t('popup_safeWordsHint')} items={settings.safeWords} onAdd={popup.addSafeWord} onRemove={popup.removeSafeWord} />
      </section>

      <section className="card">
        <h2>{t('settings_privacy')}</h2>
        <ul className="facts">
          <li>{t('privacy_local')}</li>
          <li>{t('privacy_stores')}</li>
          <li>{t('privacy_never')}</li>
          <li>{t('privacy_sites')}</li>
        </ul>
        <div className="row">
          <p className="row__title">{t('settings_data')}</p>
          {confirmClear ? (
            <div className="confirm" role="alertdialog" aria-label={t('popup_clearConfirm')}>
              <span>{t('popup_clearConfirm')}</span>
              <button type="button" className="btn" onClick={() => setConfirmClear(false)}>{t('preview_cancel')}</button>
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
          ) : (
            <button type="button" className="btn" onClick={() => { setCleared(null); setConfirmClear(true); }}>
              {t('popup_clear')}
            </button>
          )}
        </div>
        {cleared !== null && <p className="row__hint">{tCount('popup_cleared', cleared)}</p>}
      </section>
    </main>
  );
}
