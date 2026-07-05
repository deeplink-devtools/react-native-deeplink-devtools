import { describe, expect, it } from 'vitest';
import type { Route } from './index.js';

describe('@deeplink-devtools/typegen', () => {
  it('exposes the route contract the generator consumes', () => {
    const route: Route = {
      name: 'users/[id]',
      pattern: '/users/:id',
      params: [{ name: 'id', kind: 'path', optional: false, tsType: 'string' }],
      exact: true,
    };
    expect(route.params[0]?.tsType).toBe('string');
  });
});
