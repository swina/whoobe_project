import { describe, it, expect } from 'vitest';
import { unreadableRouteReason } from '../../../packages/core/src/server';

const routes = [
  { path: '/w11pvckCfcsHRvzURj9zp/sync', method: 'POST' },
  { path: 'contacts', method: 'GET' }, { path: 'contacts', method: 'POST' },
  { path: '/api/catalogo', method: 'GET' },
];
describe('which routes a data binding may read', () => {
  it('refuses a route that is only configured for another method, and says what to use it for', () => {
    const why = unreadableRouteReason(routes, '/w11pvckCfcsHRvzURj9zp/sync');
    expect(why).toContain('POST route');
    expect(why).toContain('Form settings');
  });
  it('slashes at the ends do not matter', () => {
    expect(unreadableRouteReason(routes, 'w11pvckCfcsHRvzURj9zp/sync/')).not.toBeNull();
    expect(unreadableRouteReason(routes, 'api/catalogo')).toBeNull();
  });
  it('accepts a path that has a GET route among others, a free path and no path', () => {
    expect(unreadableRouteReason(routes, 'contacts')).toBeNull();
    expect(unreadableRouteReason(routes, '/not/configured')).toBeNull();
    expect(unreadableRouteReason(routes, undefined)).toBeNull();
    expect(unreadableRouteReason([], '/x')).toBeNull();
  });
});
