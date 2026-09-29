// The chatbot sites MIRAGE runs on. Plain data with no browser APIs, so wxt.config.ts (host
// permissions), the content script (matches) and the service worker (context menu) share it.

export type Site = 'chatgpt' | 'gemini' | 'claude' | 'copilot' | 'perplexity';

export const SITE_IDS: readonly Site[] = ['chatgpt', 'gemini', 'claude', 'copilot', 'perplexity'];

/** Match patterns per site: the only pages MIRAGE can see. */
export const SITE_MATCHES: Record<Site, readonly string[]> = {
  chatgpt: ['https://chatgpt.com/*'],
  gemini: ['https://gemini.google.com/*'],
  claude: ['https://claude.ai/*'],
  copilot: ['https://copilot.microsoft.com/*'],
  perplexity: ['https://www.perplexity.ai/*', 'https://perplexity.ai/*'],
};

export const ALL_MATCHES: readonly string[] = SITE_IDS.flatMap((id) => SITE_MATCHES[id]);
