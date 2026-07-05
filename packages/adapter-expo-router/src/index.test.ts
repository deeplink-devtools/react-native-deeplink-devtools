import { describe, expect, it } from 'vitest';
import type { RouteTable } from './index.js';

describe('@deeplink-devtools/adapter-expo-router', () => {
  it('exposes the route-table contract the adapter will produce', () => {
    const table: RouteTable = { routes: [], sourceType: 'expo-router' };
    expect(table.sourceType).toBe('expo-router');
  });
});
