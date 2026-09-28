import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'MIRAGE',
    description:
      'Hides your personal details and blocks secrets before you send a prompt to ChatGPT or Gemini.',
    // storage: vault, settings, stats. alarms: the hourly 24-hour vault sweep.
    permissions: ['storage', 'alarms'],
    // Host access for the supported chatbots only (PRD, Non-functional requirements).
    host_permissions: ['https://chatgpt.com/*', 'https://gemini.google.com/*'],
  },
});
