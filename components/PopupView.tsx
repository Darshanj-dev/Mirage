// The popup (S7): a status dashboard. On/off, today's anonymous counts, which platforms are
// protected, and a link to settings. It never shows a prompt or a value.

import { browser } from 'wxt/browser';
import { SITES } from '@/lib/sites';
import { SITE_IDS } from '@/lib/sites/hosts';
import { t } from '@/lib/strings';
import { SHIELD_PATH, Switch } from './Controls';
import { usePopupState } from './usePopupState';

/** Opens Private Compose: Chrome's side panel, Firefox's sidebar. */
async function openCompose(): Promise<void> {
  try {
    const win = await browser.windows.getCurrent();
    const api = browser as unknown as {
      sidePanel?: { open(o: { windowId: number }): Promise<void> };
      sidebarAction?: { open(): Promise<void> };
    };
    if (api.sidePanel && win.id !== undefined) await api.sidePanel.open({ windowId: win.id });
    else await api.sidebarAction?.open();
    window.close();
  } catch {
    // unsupported browser: nothing to open
  }
}

export function PopupView() {
  const popup = usePopupState();
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

  const { settings, stats, site } = state;
  const siteOn = site ? settings.sites[site.id] : false;
  const status = !settings.enabled
    ? t('popup_paused')
    : site
      ? siteOn
        ? t('popup_status', [site.name])
        : t('popup_siteOff', [site.name])
      : t('popup_active');
  const on = settings.enabled && (!site || siteOn);
  const today = stats?.today;

  return (
    <main className="popup">
      <header className="header">
        <div className="brand">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d={SHIELD_PATH} />
          </svg>
          <span>MIRAGE</span>
        </div>
        <Switch
          checked={settings.enabled}
          label={settings.enabled ? t('popup_turnOff') : t('popup_turnOn')}
          onChange={(enabled) => void popup.setEnabled(enabled)}
        />
      </header>

      <p className={`status ${on ? 'status--on' : ''}`}>
        <span className="status__dot" aria-hidden="true" />
        {status}
      </p>

      {site && settings.enabled && (
        <div className="row row--compact">
          <p className="row__title">{t('popup_thisSite', [site.name])}</p>
          <Switch
            checked={siteOn}
            label={t('popup_thisSite', [site.name])}
            onChange={(v) => void popup.save({ sites: { ...settings.sites, [site.id]: v } })}
          />
        </div>
      )}

      {today && (
        <section className="stats" aria-label={t('popup_today')}>
          <p className="label">{t('popup_today')}</p>
          <dl className="stats__grid">
            <div><dt>{t('popup_statChecked')}</dt><dd>{today.checked}</dd></div>
            <div><dt>{t('popup_statHidden')}</dt><dd>{today.hidden}</dd></div>
            <div className={today.blocked ? 'is-critical' : ''}><dt>{t('popup_statBlocked')}</dt><dd>{today.blocked}</dd></div>
            <div className={today.replyWarnings ? 'is-high' : ''}><dt>{t('popup_statReplies')}</dt><dd>{today.replyWarnings}</dd></div>
          </dl>
          {stats && <p className="week">{t('popup_week', [stats.week.hidden, stats.week.blocked])}</p>}
        </section>
      )}

      <section>
        <p className="label">{t('popup_platforms')}</p>
        <ul className="platforms">
          {SITE_IDS.map((id) => {
            const s = SITES[id];
            const active = settings.enabled && settings.sites[id];
            return (
              <li key={id} className={active ? 'is-on' : ''}>
                <span className="platforms__dot" aria-hidden="true" />
                {s.name}
                {!s.verifiedOn && (
                  <span className="beta" title={t('popup_betaHint')}>
                    {t('popup_beta')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <p className="local">
        <span className="local__dot" aria-hidden="true" />
        {t('popup_local')}
      </p>

      <button type="button" className="btn btn--wide btn--primary" title={t('compose_openHint')} onClick={() => void openCompose()}>
        {t('compose_open')}
      </button>

      <footer className="footer">
        <button type="button" className="btn btn--wide" onClick={() => void browser.runtime.openOptionsPage()}>
          {t('popup_settings')}
        </button>
      </footer>
    </main>
  );
}
