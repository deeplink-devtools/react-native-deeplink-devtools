import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildRouteTable } from './scan.js';

// The example app is the acceptance fixture: its src/app tree exercises every
// convention expo-router 57 supports. See example-expo-router/README.md.
const EXAMPLE_APP_DIR = fileURLToPath(
  new URL('../../../example-expo-router/src/app', import.meta.url),
);

describe('golden snapshot: example-expo-router', () => {
  const result = buildRouteTable(EXAMPLE_APP_DIR);

  it('scans the example app without diagnostics', () => {
    expect(result.diagnostics).toEqual([]);
  });

  it('covers every convention in the route table', () => {
    const patterns = result.table.routes.map((r) => r.pattern);
    expect(patterns).toContain('/'); // index
    expect(patterns).toContain('/about'); // static
    expect(patterns).toContain('/home'); // (group) stripped
    expect(patterns).toContain('/settings'); // nested index in group
    expect(patterns).toContain('/users/:id'); // dynamic dir + index
    expect(patterns).toContain('/posts/*slug'); // catch-all
    expect(patterns).toContain('/promo'); // (a,b) array group
    expect(patterns).toContain('/docs/:page'); // platform variants deduped
    expect(patterns).toContain('/*not-found'); // +not-found
    expect(result.apiRoutes).toEqual(['api/users+api.ts']);
    expect(result.layouts.map((l) => [l.sourceFile, l.anchor])).toEqual([
      ['(tabs)/_layout.tsx', 'home'],
      ['(tabs)/settings/_layout.tsx', 'index'],
      ['_layout.tsx', undefined],
    ]);
  });

  it('matches the golden RouteTable snapshot', () => {
    expect(result).toMatchSnapshot();
  });
});
