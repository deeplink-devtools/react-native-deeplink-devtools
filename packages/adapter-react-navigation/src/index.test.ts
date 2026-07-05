import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildRouteTable, parseConfigSpecifier, scanLinkingModule } from './index.js';
import type { RouteTable } from './index.js';

const FIXTURES_DIR = fileURLToPath(new URL('./__fixtures__', import.meta.url));

describe('@deeplink-devtools/adapter-react-navigation', () => {
  it('exposes the adapter surface', () => {
    expect(typeof buildRouteTable).toBe('function');
    expect(typeof scanLinkingModule).toBe('function');
    expect(typeof parseConfigSpecifier).toBe('function');
    const table: RouteTable = { routes: [], sourceType: 'react-navigation' };
    expect(table.sourceType).toBe('react-navigation');
  });

  it('scanLinkingModule returns an empty table with diagnostics when loading fails', async () => {
    const result = await scanLinkingModule('side-effects/linking.ts', { cwd: FIXTURES_DIR });
    expect(result.table.routes).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe('CONFIG_LOAD_FAILED');
    expect(result.prefixes).toEqual([]);
  });

  it('scanLinkingModule loads and scans in one step', async () => {
    const result = await scanLinkingModule('named-export.ts', { cwd: FIXTURES_DIR });
    expect(result.diagnostics).toEqual([]);
    expect(result.table.routes.map((r) => r.pattern)).toEqual(['/home']);
    expect(result.table.routes[0]?.sourceFile).toBe('named-export.ts');
  });
});
