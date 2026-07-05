import { describe, expect, it } from 'vitest';
import type { RouteTable } from './index.js';

describe('@deeplink-devtools/adapter-react-navigation', () => {
  it('exposes the route-table contract the adapter will produce', () => {
    const table: RouteTable = { routes: [], sourceType: 'react-navigation' };
    expect(table.sourceType).toBe('react-navigation');
  });
});
