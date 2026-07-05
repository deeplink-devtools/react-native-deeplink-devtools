import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ReactNavigationScanResult } from './scan.js';
import { scanLinkingModule } from './index.js';

// The example app is the acceptance fixture: its linking.ts exercises every
// linking-config convention. See example-react-navigation/README.md. Passing
// its directory as cwd keeps sourceFile identical however vitest is invoked.
const EXAMPLE_APP_DIR = fileURLToPath(
  new URL('../../../example-react-navigation', import.meta.url),
);

describe('golden snapshot: example-react-navigation', () => {
  let result: ReactNavigationScanResult;

  beforeAll(async () => {
    result = await scanLinkingModule('src/navigation/linking.ts#linking', {
      cwd: EXAMPLE_APP_DIR,
    });
  });

  it('loads and scans the example linking config without diagnostics', () => {
    expect(result.diagnostics).toEqual([]);
  });

  it('covers every convention in the route table', () => {
    const patterns = result.table.routes.map((r) => r.pattern);
    expect(patterns).toContain('/'); // navigator with empty path
    expect(patterns).toContain('/feed'); // level-2 navigator path + empty-path leaf
    expect(patterns).toContain('/feed/article/:slug/:commentId?'); // 3-level nesting, optional param
    expect(patterns).toContain('/search'); // exact: true escapes /feed
    expect(patterns).toContain('/user/:id'); // custom parse
    expect(patterns).toContain('/u/:id'); // alias
    expect(patterns).toContain('/promo/:code(SUMMER|WINTER)'); // regex-constrained param
    expect(patterns).toContain('/settings/notifications'); // child of a pathless navigator
    expect(patterns).toContain('/*'); // wildcard / not-found

    const article = result.table.routes.find((r) => r.name === 'HomeTabs/Feed/Article');
    expect(article?.params).toEqual([
      { name: 'slug', kind: 'path', optional: false, tsType: 'string' },
      { name: 'commentId', kind: 'path', optional: true, tsType: 'unknown (custom parse)' },
    ]);

    expect(result.prefixes).toEqual([
      'examplereactnavigation://',
      'https://deeplink-devtools.example.com',
    ]);
    expect(result.pathlessScreens).toEqual(['Settings/DevMenu']);
  });

  it('matches the golden scan-result snapshot', () => {
    expect(result).toMatchSnapshot();
  });
});
