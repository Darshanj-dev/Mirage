import { describe, expect, it } from 'vitest';
import { SITES, siteForHost } from './sites';

describe('sites', () => {
  it('finds the site for a host', () => {
    expect(siteForHost('chatgpt.com')?.id).toBe('chatgpt');
    expect(siteForHost('gemini.google.com')?.id).toBe('gemini');
    expect(siteForHost('claude.ai')).toBeNull();
    expect(siteForHost('evilchatgpt.com')).toBeNull();
  });

  it('reads the ChatGPT conversation id from the URL', () => {
    const { chatIdFromPath } = SITES.chatgpt;
    expect(chatIdFromPath('/c/6aba9d4b-dda0-83ee-8efe-6b2ff8846a89')).toBe('6aba9d4b-dda0-83ee-8efe-6b2ff8846a89');
    expect(chatIdFromPath('/g/g-abc123-helper/c/6aba9d4b-dda0-83ee-8efe-6b2ff8846a89')).toBe(
      '6aba9d4b-dda0-83ee-8efe-6b2ff8846a89',
    );
    expect(chatIdFromPath('/')).toBeNull();
  });

  it('reads the Gemini conversation id from the URL', () => {
    const { chatIdFromPath } = SITES.gemini;
    expect(chatIdFromPath('/app/1674c799c034fd88')).toBe('1674c799c034fd88');
    expect(chatIdFromPath('/u/1/app/1674c799c034fd88')).toBe('1674c799c034fd88');
    expect(chatIdFromPath('/app')).toBeNull();
    expect(chatIdFromPath('/app/')).toBeNull();
    expect(chatIdFromPath('/gem/some-gem-name')).toBeNull();
  });

  it('ignores the in-between URL ChatGPT shows right after the first send', () => {
    const { chatIdFromPath } = SITES.chatgpt;
    expect(chatIdFromPath('/c/WEB:6aba9d4b-dda0-83ee-8efe-6b2ff8846a89')).toBeNull();
    expect(chatIdFromPath('/c/WEB')).toBeNull();
    expect(chatIdFromPath('/c/6aba9d4b-dda0')).toBeNull();
  });
});
