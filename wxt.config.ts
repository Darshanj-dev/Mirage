import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    // storage: vault, settings, stats. alarms: the hourly 24-hour vault sweep.
    permissions: ['storage', 'alarms'],
    // Host access for the supported chatbots only (PRD, Non-functional requirements).
    host_permissions: ['https://chatgpt.com/*', 'https://gemini.google.com/*'],
  },
});
