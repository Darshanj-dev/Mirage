import { defineConfig } from 'wxt';
import { ALL_MATCHES } from './lib/sites/hosts';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    // storage: vault, settings, stats. alarms: the hourly 24-hour vault sweep.
    // contextMenus: right-click "Always hide" on the chatbot pages.
    permissions: ['storage', 'alarms', 'contextMenus'],
    // Host access for the supported chatbots only (PRD, Non-functional requirements).
    // No "tabs", "scripting", "webRequest" or <all_urls>: MIRAGE sees nothing else.
    host_permissions: [...ALL_MATCHES],
  },
});
