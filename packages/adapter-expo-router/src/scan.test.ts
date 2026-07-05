import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildRouteTable } from './scan.js';

let fixtureDir: string | undefined;

/** Create a throwaway app directory containing the given (empty) route files. */
function fixture(files: string[]): string {
  fixtureDir = mkdtempSync(join(tmpdir(), 'rndl-adapter-'));
  for (const file of files) {
    const absolute = join(fixtureDir, ...file.split('/'));
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, 'export default function Screen() { return null; }\n');
  }
  return fixtureDir;
}

afterEach(() => {
  if (fixtureDir !== undefined) {
    rmSync(fixtureDir, { recursive: true, force: true });
    fixtureDir = undefined;
  }
});

describe('buildRouteTable', () => {
  it('maps the core conventions to patterns and params', () => {
    const { table, diagnostics } = buildRouteTable(
      fixture(['index.tsx', '(group)/team.tsx', 'users/[id]/index.tsx', 'blog/[...slug].tsx']),
    );
    expect(diagnostics).toEqual([]);
    expect(table.sourceType).toBe('expo-router');
    expect(table.routes).toEqual([
      {
        name: '(group)/team',
        pattern: '/team',
        params: [],
        sourceFile: '(group)/team.tsx',
        exact: true,
      },
      {
        name: 'blog/[...slug]',
        pattern: '/blog/*slug',
        params: [{ name: 'slug', kind: 'catch-all', optional: false, tsType: 'string[]' }],
        sourceFile: 'blog/[...slug].tsx',
        exact: false,
      },
      { name: 'index', pattern: '/', params: [], sourceFile: 'index.tsx', exact: true },
      {
        name: 'users/[id]/index',
        pattern: '/users/:id',
        params: [{ name: 'id', kind: 'path', optional: false, tsType: 'string' }],
        sourceFile: 'users/[id]/index.tsx',
        exact: true,
      },
    ]);
  });

  it('treats a catch-all directory with an index file as a subtree match', () => {
    const { table } = buildRouteTable(fixture(['posts/[...slug]/index.tsx']));
    expect(table.routes[0]).toMatchObject({ pattern: '/posts/*slug', exact: false });
  });

  it('warns on unknown conventions instead of crashing', () => {
    const { table, diagnostics } = buildRouteTable(
      fixture(['+bogus.tsx', 'weird/[unclosed.tsx', 'ok.tsx']),
    );
    expect(table.routes.map((r) => r.pattern)).toEqual(['/ok']);
    expect(diagnostics.map((d) => [d.severity, d.code])).toEqual([
      ['warn', 'UNKNOWN_CONVENTION'],
      ['warn', 'UNKNOWN_CONVENTION'],
    ]);
  });

  it('recognizes root specials and flags misplaced ones', () => {
    const { table, diagnostics } = buildRouteTable(
      fixture(['+html.tsx', '+native-intent.tsx', '+middleware.ts', 'nested/+middleware.ts']),
    );
    expect(table.routes).toEqual([]);
    expect(diagnostics.map((d) => d.code)).toEqual(['MISPLACED_SPECIAL_FILE']);
  });

  it('excludes API routes from the table and lists them separately', () => {
    const { table, apiRoutes, diagnostics } = buildRouteTable(
      fixture(['api/users+api.ts', 'api/posts+api.web.ts']),
    );
    expect(table.routes).toEqual([]);
    expect(apiRoutes).toEqual(['api/users+api.ts']);
    expect(diagnostics.map((d) => d.code)).toEqual(['PLATFORM_API_ROUTE']);
  });

  it('dedupes platform variants and requires a fallback', () => {
    const { table, diagnostics } = buildRouteTable(
      fixture(['docs/[page].tsx', 'docs/[page].web.tsx', 'onboarding.ios.tsx']),
    );
    expect(table.routes.map((r) => [r.pattern, r.sourceFile])).toEqual([
      ['/docs/:page', 'docs/[page].tsx'],
      ['/onboarding', 'onboarding.ios.tsx'],
    ]);
    expect(diagnostics.map((d) => d.code)).toEqual(['PLATFORM_ROUTE_NO_FALLBACK']);
  });

  it('maps +not-found to an optional catch-all pattern', () => {
    const { table } = buildRouteTable(fixture(['+not-found.tsx', 'sub/+not-found.tsx']));
    expect(table.routes).toEqual([
      {
        name: '+not-found',
        pattern: '/*not-found',
        params: [{ name: 'not-found', kind: 'catch-all', optional: true, tsType: 'string[]' }],
        sourceFile: '+not-found.tsx',
        exact: false,
      },
      {
        name: 'sub/+not-found',
        pattern: '/sub/*not-found',
        params: [{ name: 'not-found', kind: 'catch-all', optional: true, tsType: 'string[]' }],
        sourceFile: 'sub/+not-found.tsx',
        exact: false,
      },
    ]);
  });

  it('collects layouts with best-effort anchors and keeps them out of the table', () => {
    const dir = fixture(['home.tsx']);
    writeFileSync(
      join(dir, '_layout.tsx'),
      "import { Stack } from 'expo-router';\n" +
        "export const unstable_settings = { anchor: 'home' };\n" +
        'export default function Layout() { return null; }\n',
    );
    mkdirSync(join(dir, 'legacy'));
    writeFileSync(
      join(dir, 'legacy', '_layout.tsx'),
      "export const unstable_settings = { initialRouteName: 'first' };\n" +
        'export default function Layout() { return null; }\n',
    );
    const { table, layouts } = buildRouteTable(dir);
    expect(table.routes.map((r) => r.name)).toEqual(['home']);
    expect(layouts).toEqual([
      { sourceFile: '_layout.tsx', anchor: 'home' },
      { sourceFile: 'legacy/_layout.tsx', anchor: 'first' },
    ]);
  });

  it('warns when two files resolve to the same URL pattern', () => {
    const { table, diagnostics } = buildRouteTable(fixture(['(a)/pricing.tsx', '(b)/pricing.tsx']));
    expect(table.routes).toHaveLength(2);
    expect(diagnostics.map((d) => d.code)).toEqual(['DUPLICATE_PATTERN']);
  });

  it('errors actionably when the app directory is missing', () => {
    const { table, diagnostics } = buildRouteTable(join(tmpdir(), 'rndl-does-not-exist'));
    expect(table.routes).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'APP_DIR_NOT_FOUND' });
    expect(diagnostics[0]?.fix).toContain('--app-dir');
  });

  it('warns when the directory contains no route files', () => {
    const { diagnostics } = buildRouteTable(fixture([]));
    expect(diagnostics.map((d) => d.code)).toEqual(['NO_ROUTES_FOUND']);
  });

  it('is deterministic across scans', () => {
    const dir = fixture(['b.tsx', 'a.tsx', 'c/[x].tsx', '(g)/d.tsx']);
    expect(buildRouteTable(dir)).toEqual(buildRouteTable(dir));
  });

  it('ignores dot-directories and non-route files', () => {
    const dir = fixture(['real.tsx']);
    mkdirSync(join(dir, '.expo'));
    writeFileSync(join(dir, '.expo', 'ghost.tsx'), '');
    writeFileSync(join(dir, 'styles.css'), '');
    writeFileSync(join(dir, 'readme.md'), '');
    const { table, diagnostics } = buildRouteTable(dir);
    expect(table.routes.map((r) => r.name)).toEqual(['real']);
    expect(diagnostics).toEqual([]);
  });
});
