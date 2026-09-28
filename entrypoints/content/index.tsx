// Runs on ChatGPT and Gemini. The send guard is installed at document_start, before the
// page's own scripts, so no send can slip past it; the UI mounts once the page has a body.

import ReactDOM from 'react-dom/client';
import { MirageApp } from '@/components/MirageApp';
import '@/components/mirage.css';
import { installSendGuard } from '@/lib/page/sendGuard';
import { siteForHost } from '@/lib/sites';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://gemini.google.com/*'],
  runAt: 'document_start',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const site = siteForHost(location.hostname);
    if (!site?.ready) return; // Gemini: selectors come in M5

    const guard = installSendGuard(site);
    ctx.onInvalidated(() => guard.dispose()); // extension reloaded: stop guarding with dead code

    if (document.readyState === 'loading') {
      await new Promise<void>((resolve) => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
    }

    const ui = await createShadowRootUi(ctx, {
      name: 'mirage-ui',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      onMount(container) {
        const root = ReactDOM.createRoot(container);
        root.render(<MirageApp site={site} guard={guard} />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
  },
});
