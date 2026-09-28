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
    expect(chatIdFromPath('/c/68f2a1b4-5c3d-8000-9e1f-0a1b2c3d4e5f')).toBe('68f2a1b4-5c3d-8000-9e1f-0a1b2c3d4e5f');
    expect(chatIdFromPath('/g/g-abc123-helper/c/68f2a1b4-5c3d')).toBe('68f2a1b4-5c3d');
    expect(chatIdFromPath('/')).toBeNull();
  });
});
