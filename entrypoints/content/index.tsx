// Runs on ChatGPT and Gemini; mounts MIRAGE's UI inside a Shadow DOM.

import ReactDOM from 'react-dom/client';
import { MirageApp } from '@/components/MirageApp';
import '@/components/mirage.css';
import { siteForHost } from '@/lib/sites';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://gemini.google.com/*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    const site = siteForHost(location.hostname);
    if (!site?.ready) return; // Gemini: selectors come in M5

    const ui = await createShadowRootUi(ctx, {
      name: 'mirage-ui',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      onMount(container) {
        const root = ReactDOM.createRoot(container);
        root.render(<MirageApp site={site} />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
  },
});
