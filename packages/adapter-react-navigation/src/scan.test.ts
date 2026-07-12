import { describe, expect, it } from 'vitest';
import { buildRouteTable } from './scan.js';

const codes = (result: ReturnType<typeof buildRouteTable>) =>
  result.diagnostics.map((d) => `${d.severity}:${d.code}`);

describe('buildRouteTable: pattern composition', () => {
  it('turns a string shorthand into a route', () => {
    const result = buildRouteTable({ screens: { Home: 'home' } });
    expect(result.table.routes).toEqual([
      { name: 'Home', pattern: '/home', params: [], exact: true },
    ]);
    expect(result.table.sourceType).toBe('react-navigation');
  });

  it('concatenates paths across three levels of nesting', () => {
    const result = buildRouteTable({
      screens: {
        A: { path: 'a', screens: { B: { path: 'b', screens: { C: 'c/:id' } } } },
      },
    });
    const c = result.table.routes.find((r) => r.name === 'A/B/C');
    expect(c?.pattern).toBe('/a/b/c/:id');
    expect(c?.params).toEqual([{ name: 'id', kind: 'path', optional: false, tsType: 'string' }]);
  });

  it('lets exact: true escape the parent prefix', () => {
    const result = buildRouteTable({
      screens: { A: { path: 'a', screens: { B: { path: 'b', exact: true } } } },
    });
    expect(result.table.routes.map((r) => r.pattern)).toEqual(['/a', '/b']);
  });

  it('drops the parent params too when exact: true', () => {
    const result = buildRouteTable({
      screens: {
        A: { path: 'a/:aid', screens: { B: { path: 'b', exact: true } } },
      },
    });
    const b = result.table.routes.find((r) => r.name === 'A/B');
    expect(b?.params).toEqual([]);
  });

  it('resolves an empty-path leaf to the parent pattern', () => {
    const result = buildRouteTable({
      screens: { Tabs: { path: '', screens: { Feed: { path: 'feed', screens: { List: '' } } } } },
    });
    const list = result.table.routes.find((r) => r.name === 'Tabs/Feed/List');
    expect(list?.pattern).toBe('/feed');
    // Navigator + initial child sharing a pattern is legal - no diagnostic.
    expect(result.diagnostics).toEqual([]);
  });

  it('prefixes every pattern with the top-level config path, even exact ones', () => {
    const result = buildRouteTable({
      path: 'mobile/app',
      screens: { A: { path: 'a', screens: { B: { path: 'b', exact: true } } } },
    });
    expect(result.table.routes.map((r) => r.pattern)).toEqual(['/mobile/app/a', '/mobile/app/b']);
  });

  it('stamps sourceFile on every route when provided', () => {
    const result = buildRouteTable({ screens: { Home: 'home' } }, { sourceFile: 'src/linking.ts' });
    expect(result.table.routes[0]?.sourceFile).toBe('src/linking.ts');
  });
});

describe('buildRouteTable: params', () => {
  it('marks a trailing ? param optional', () => {
    const result = buildRouteTable({ screens: { A: 'article/:slug/:commentId?' } });
    expect(result.table.routes[0]?.params).toEqual([
      { name: 'slug', kind: 'path', optional: false, tsType: 'string' },
      { name: 'commentId', kind: 'path', optional: true, tsType: 'string' },
    ]);
  });

  it('strips a regex constraint from the param name but keeps it in the pattern', () => {
    const result = buildRouteTable({ screens: { Promo: 'promo/:code(SUMMER|WINTER)' } });
    expect(result.table.routes[0]?.pattern).toBe('/promo/:code(SUMMER|WINTER)');
    expect(result.table.routes[0]?.params).toEqual([
      { name: 'code', kind: 'path', optional: false, tsType: 'string' },
    ]);
  });

  it('treats a * wildcard as a catch-all with no named param', () => {
    const result = buildRouteTable({ screens: { NotFound: '*' } });
    expect(result.table.routes[0]).toEqual({
      name: 'NotFound',
      pattern: '/*',
      params: [],
      exact: false,
    });
  });

  it("types params with a custom parse as 'unknown (custom parse)'", () => {
    const result = buildRouteTable({
      screens: { User: { path: 'user/:id', parse: { id: Number } } },
    });
    expect(result.table.routes[0]?.params).toEqual([
      { name: 'id', kind: 'path', optional: false, tsType: 'unknown (custom parse)' },
    ]);
  });

  it('emits parse/stringify keys that match no path param as query params', () => {
    const result = buildRouteTable({
      screens: {
        Feed: {
          path: 'feed',
          parse: { sort: String },
          stringify: { page: (n: never) => String(n) },
        },
      },
    });
    expect(result.table.routes[0]?.params).toEqual([
      { name: 'sort', kind: 'query', optional: true, tsType: 'unknown (custom parse)' },
      { name: 'page', kind: 'query', optional: true, tsType: 'string' },
    ]);
  });
});

describe('buildRouteTable: aliases', () => {
  it('emits an extra route per string alias, inheriting prefix and parse', () => {
    const result = buildRouteTable({
      screens: {
        Tabs: {
          path: 't',
          screens: { User: { path: 'user/:id', alias: ['u/:id'], parse: { id: Number } } },
        },
      },
    });
    const users = result.table.routes.filter((r) => r.name === 'Tabs/User');
    expect(users.map((r) => r.pattern)).toEqual(['/t/user/:id', '/t/u/:id']);
    expect(users[1]?.params).toEqual([
      { name: 'id', kind: 'path', optional: false, tsType: 'unknown (custom parse)' },
    ]);
  });

  it('honors an object alias with its own exact and parse', () => {
    const result = buildRouteTable({
      screens: {
        Tabs: {
          path: 't',
          screens: {
            User: {
              path: 'user/:id',
              alias: [{ path: 'profile/:id', exact: true, parse: { id: Number } }],
            },
          },
        },
      },
    });
    const [, alias] = result.table.routes.filter((r) => r.name === 'Tabs/User');
    expect(alias?.pattern).toBe('/profile/:id');
    expect(alias?.params[0]?.tsType).toBe('unknown (custom parse)');
  });

  it('still prefixes a string alias with the parent path when the main path is exact', () => {
    // Mirrors createNormalizedConfigs: alias configs are built before exact
    // clears the accumulated parent paths.
    const result = buildRouteTable({
      screens: {
        Tabs: { path: 't', screens: { S: { path: 's', exact: true, alias: ['x'] } } },
      },
    });
    expect(result.table.routes.map((r) => r.pattern)).toEqual(['/t', '/s', '/t/x']);
  });

  it('errors on alias without a path, like React Navigation does', () => {
    const result = buildRouteTable({ screens: { A: { alias: ['a'] } } });
    expect(codes(result)).toContain('error:ALIAS_WITHOUT_PATH');
    expect(result.table.routes).toEqual([]);
  });
});

describe('buildRouteTable: input shapes and prefixes', () => {
  it('accepts full LinkingOptions and captures prefixes', () => {
    const result = buildRouteTable({
      prefixes: ['myapp://', 'https://example.com'],
      config: { screens: { Home: 'home' } },
    });
    expect(result.prefixes).toEqual(['myapp://', 'https://example.com']);
    expect(result.diagnostics).toEqual([]);
  });

  it('accepts a bare config without flagging its inherent lack of prefixes', () => {
    const result = buildRouteTable({ screens: { Home: 'home' } });
    expect(result.prefixes).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it('warns on LinkingOptions without prefixes', () => {
    const result = buildRouteTable({ config: { screens: { Home: 'home' } } });
    expect(codes(result)).toContain('warn:NO_PREFIXES');
  });

  it('rejects non-config values with CONFIG_INVALID_SHAPE and an empty table', () => {
    for (const bad of [null, 42, 'nope', {}, { linking: true }]) {
      const result = buildRouteTable(bad);
      expect(codes(result)).toContain('error:CONFIG_INVALID_SHAPE');
      expect(result.table.routes).toEqual([]);
    }
  });

  it('warns NO_SCREENS on an empty or missing screens map', () => {
    expect(codes(buildRouteTable({ prefixes: ['myapp://'] }))).toContain('warn:NO_SCREENS');
    expect(codes(buildRouteTable({ config: { screens: {} }, prefixes: ['x://'] }))).toContain(
      'warn:NO_SCREENS',
    );
  });
});

describe('buildRouteTable: diagnostics', () => {
  it('collects pathless leaves but not pathless navigators', () => {
    const result = buildRouteTable({
      screens: {
        Settings: { screens: { Notifications: 'settings/notifications', DevMenu: {} } },
      },
    });
    expect(result.pathlessScreens).toEqual(['Settings/DevMenu']);
    expect(result.table.routes.map((r) => r.pattern)).toEqual(['/settings/notifications']);
  });

  it('warns on a screen value that is neither string nor object and skips it', () => {
    const result = buildRouteTable({ screens: { Bad: 42 as unknown as string, Ok: 'ok' } });
    expect(codes(result)).toContain('warn:INVALID_SCREEN_CONFIG');
    expect(result.table.routes.map((r) => r.name)).toEqual(['Ok']);
  });

  it('warns on unknown screen-config keys', () => {
    const result = buildRouteTable({
      screens: { A: { path: 'a', regex: 'x' } as Record<string, unknown> },
    });
    const diag = result.diagnostics.find((d) => d.code === 'INVALID_SCREEN_CONFIG');
    expect(diag?.severity).toBe('warn');
    expect(diag?.message).toContain("'regex'");
  });

  it('errors on path strings React Navigation itself throws on', () => {
    for (const badPath of ['a:b', 'x/:id(', ':id/:id', 'a(b)']) {
      const result = buildRouteTable({ screens: { A: badPath } });
      expect(codes(result)).toContain('error:INVALID_PATH_PATTERN');
    }
  });

  it('errors on a top-level path containing params', () => {
    const result = buildRouteTable({ path: 'app/:v', screens: { Home: 'home' } });
    expect(codes(result)).toContain('error:INVALID_PATH_PATTERN');
    // The screens are still scanned, without the invalid prefix.
    expect(result.table.routes.map((r) => r.pattern)).toEqual(['/home']);
  });

  it('errors on duplicate patterns from unrelated screens, like React Navigation', () => {
    const result = buildRouteTable({ screens: { A: 'same', B: 'same' } });
    const diag = result.diagnostics.find((d) => d.code === 'DUPLICATE_PATTERN');
    expect(diag?.severity).toBe('error');
    expect(diag?.message).toContain("'A'");
    expect(diag?.message).toContain("'B'");
  });

  it('does not flag a navigator and its child sharing a pattern', () => {
    const result = buildRouteTable({
      screens: { Feed: { path: 'feed', screens: { List: '' } } },
    });
    expect(result.diagnostics).toEqual([]);
  });
});
