import { describe, expect, it } from 'vitest';
import { buildRouteTable } from './index.js';
import type { ExpoRouterScanResult, RouteTable } from './index.js';

describe('@deeplink-devtools/adapter-expo-router', () => {
  it('exposes buildRouteTable and the route-table contract', () => {
    expect(typeof buildRouteTable).toBe('function');
    const table: RouteTable = { routes: [], sourceType: 'expo-router' };
    const result: ExpoRouterScanResult = {
      table,
      diagnostics: [],
      apiRoutes: [],
      layouts: [],
    };
    expect(result.table.sourceType).toBe('expo-router');
  });
});
