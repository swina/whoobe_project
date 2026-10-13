import { describe, it, expect } from 'vitest';
import { validateClientScopes, parseAutomationScope, automationScopeAllows } from '../../../packages/core/src/server';

describe('automation scopes', () => {
  it('accepts a route, a template and *; keeps data and gateway scopes next to them', () => {
    const r = validateClientScopes(['automation:run:n8n:webhook/signup', 'automation:run:n8n:webhook/signup', 'automation:run:n8n:*', 'automation:run:AP:webhooks/{id}', 'data:read:Blog']);
    expect(r).toEqual({ ok: true, scopes: ['automation:run:n8n:webhook/signup', 'automation:run:n8n:*', 'automation:run:AP:webhooks/{id}', 'data:read:Blog'] });
  });
  it('refuses wildcard endpoints, prefix wildcards, relative routes and other actions', () => {
    for (const s of ['automation:run:*:x', 'automation:run:n8n:webhook/*', 'automation:run:n8n:../x', 'automation:run:n8n:/x', 'automation:run:n8n:', 'automation:stop:n8n:x', 'automation:run:n8n:a//b']) {
      expect(validateClientScopes([s]).ok, s).toBe(false);
    }
  });
  it('matches the endpoint and the route template, never a prefix', () => {
    const sc = ['automation:run:n8n:webhook/signup'];
    expect(automationScopeAllows(sc, 'n8n', 'webhook/signup')).toBe(true);
    expect(automationScopeAllows(sc, 'n8n', '/webhook/signup')).toBe(true);
    expect(automationScopeAllows(sc, 'n8n', 'webhook/other')).toBe(false);
    expect(automationScopeAllows(sc, 'AP', 'webhook/signup')).toBe(false);
    expect(automationScopeAllows(['automation:run:n8n:*'], 'n8n', 'anything/here')).toBe(true);
    expect(automationScopeAllows(['gateway:call:n8n:POST:webhook/signup'], 'n8n', 'webhook/signup')).toBe(false);
  });
  it('parses', () => {
    expect(parseAutomationScope('automation:run:n8n:a:b')).toEqual({ endpoint: 'n8n', route: 'a:b' });
  });
});
