import { describe, it, expect } from 'vitest';
import { communityUrl, DEFAULT_COMMUNITY_URL } from './community.js';

describe('communityUrl', () => {
  it('is the project discussions when COMMUNITY_URL is not set', () => {
    expect(communityUrl({})).toBe(DEFAULT_COMMUNITY_URL);
  });
  it('is nothing when COMMUNITY_URL is empty (the entry is hidden)', () => {
    expect(communityUrl({ COMMUNITY_URL: '' })).toBeNull();
    expect(communityUrl({ COMMUNITY_URL: '   ' })).toBeNull();
  });
  it('takes an http or https address of the operator', () => {
    expect(communityUrl({ COMMUNITY_URL: 'https://forum.example.com/whoobe' })).toBe('https://forum.example.com/whoobe');
    expect(communityUrl({ COMMUNITY_URL: ' http://intranet.local/help ' })).toBe('http://intranet.local/help');
  });
  it('refuses anything that is not an http(s) URL', () => {
    for (const v of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.com', 'mailto:a@b.c', 'not a url', '//example.com']) {
      expect(communityUrl({ COMMUNITY_URL: v }), v).toBeNull();
    }
  });
});
