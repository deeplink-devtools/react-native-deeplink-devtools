import type { Diagnostic, Param, Route, RouteTable } from '@deeplink-devtools/core';
import type {
  ReactNavigationAlias,
  ReactNavigationLinkingConfig,
  ReactNavigationParseConfig,
  ReactNavigationPathConfig,
  ReactNavigationScreensMap,
  ReactNavigationStringifyConfig,
} from './types.js';

/**
 * Everything {@link buildRouteTable} learned about a React Navigation linking
 * configuration.
 */
export interface ReactNavigationScanResult {
  /** Navigable routes, in config declaration order (aliases follow their screen). */
  table: RouteTable;
  /**
   * Findings produced while scanning. Codes emitted by this adapter:
   *
   * - `CONFIG_LOAD_FAILED` (error) - the linking module could not be imported (emitted by the loader).
   * - `CONFIG_EXPORT_NOT_FOUND` (error) - the requested export is missing from the module (emitted by the loader).
   * - `CONFIG_INVALID_SHAPE` (error) - the value is neither a `LinkingOptions` object nor a bare `{ screens }` config.
   * - `INVALID_PATH_PATTERN` (error) - a `path` string React Navigation's own parser rejects (it would throw at runtime).
   * - `ALIAS_WITHOUT_PATH` (error) - `alias` on a screen with no `path`; React Navigation throws on this.
   * - `DUPLICATE_PATTERN` (error) - two unrelated screens resolve to the same pattern; React Navigation throws on this.
   * - `NO_SCREENS` (warn) - no `screens` map to scan; URLs would fall back to segment-as-route-name matching.
   * - `INVALID_SCREEN_CONFIG` (warn) - a screen value is neither string nor object (subtree skipped), or carries unknown keys.
   * - `NO_PREFIXES` (warn) - LinkingOptions without a `prefixes` array; the app cannot receive deep links.
   */
  diagnostics: Diagnostic[];
  /** URL prefixes declared in `LinkingOptions.prefixes`; empty for a bare config. */
  prefixes: string[];
  /**
   * Screens reachable only via `navigate()` - no `path` of their own and no
   * descendant with one. Ancestry-qualified (`Settings/DevMenu`). Not an error:
   * screens are frequently kept out of the URL space on purpose.
   */
  pathlessScreens: string[];
}

/** How {@link buildRouteTable} labels routes it emits. */
export interface BuildRouteTableOptions {
  /** Recorded as every route's `sourceFile`, e.g. the loaded module's path. */
  sourceFile?: string;
}

/** Keys React Navigation's own `validatePathConfig` accepts on a screen config. */
const SCREEN_CONFIG_KEYS = new Set([
  'path',
  'exact',
  'parse',
  'stringify',
  'alias',
  'initialRouteName',
  'screens',
]);

/** One `/`-separated piece of a path pattern, as parsed by React Navigation. */
interface PatternPart {
  /** The authored segment, e.g. `feed`, `:id?`, `:code(A|B)`, `*`. */
  segment: string;
  /** Param name with `:`, `?` and the regex stripped; absent for static segments and `*`. */
  param?: string;
  optional?: boolean;
}

/**
 * Parse a `path` string into segments. This mirrors the state machine in
 * `@react-navigation/core`'s `getPatternParts` (7.21) including its error
 * conditions, because a path that throws there crashes the user's app on the
 * first deep link - we must flag exactly the same inputs.
 */
function getPatternParts(path: string): PatternPart[] {
  const parts: PatternPart[] = [];
  let current: PatternPart = { segment: '' };
  let isRegex = false;
  let isParam = false;
  let regexInnerParens = 0;

  for (let i = 0; i <= path.length; i++) {
    const char = path[i];

    if (char != null) {
      current.segment += char;
    }

    if (char === ':') {
      if (current.segment === ':') {
        isParam = true;
      } else if (!isRegex) {
        throw new Error(`Encountered ':' in the middle of a segment in path: ${path}`);
      }
    } else if (char === '(') {
      if (isParam) {
        if (isRegex) {
          regexInnerParens++;
        } else {
          isRegex = true;
        }
      } else {
        throw new Error(`Encountered '(' without preceding ':' in path: ${path}`);
      }
    } else if (char === ')') {
      if (isParam && isRegex) {
        if (regexInnerParens > 0) {
          regexInnerParens--;
        } else {
          isRegex = false;
          isParam = false;
        }
      } else {
        throw new Error(`Encountered ')' without preceding '(' in path: ${path}`);
      }
    } else if (char === '?' && !isRegex) {
      if (current.param !== undefined) {
        isParam = false;
        current.optional = true;
      } else {
        throw new Error(`Encountered '?' without preceding ':' in path: ${path}`);
      }
    } else if (char == null || (char === '/' && !isRegex)) {
      isParam = false;
      current.segment = current.segment.replace(/\/$/, '');
      if (current.segment !== '') {
        if (current.param !== undefined) {
          current.param = current.param.replace(/^:/, '');
        }
        parts.push(current);
      }
      if (char == null) {
        break;
      }
      current = { segment: '' };
      continue;
    }

    // The regex body itself is kept only inside `segment`; while in it, no
    // param-name characters accumulate.
    if (!isRegex && isParam) {
      current.param = (current.param ?? '') + char;
    }
  }

  if (isRegex) {
    throw new Error(`Could not find closing ')' in path: ${path}`);
  }

  const names = parts.map((p) => p.param).filter((p): p is string => p !== undefined);
  for (const [index, name] of names.entries()) {
    if (names.indexOf(name) !== index) {
      throw new Error(`Duplicate param name '${name}' found in path: ${path}`);
    }
  }

  return parts;
}

/** `true` when one route-name chain is a prefix of the other (navigator + child). */
function chainsIntersect(a: string[], b: string[]): boolean {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.every((name, i) => longer[i] === name);
}

/** Build the path params of freshly parsed segments, honoring a `parse` map. */
function paramsOf(parts: PatternPart[], parse: ReactNavigationParseConfig | undefined): Param[] {
  const params: Param[] = [];
  for (const part of parts) {
    if (part.param === undefined) {
      continue;
    }
    params.push({
      name: part.param,
      kind: 'path',
      optional: part.optional === true,
      tsType: parse !== undefined && part.param in parse ? 'unknown (custom parse)' : 'string',
    });
  }
  return params;
}

/**
 * Query params React Navigation would feed through this screen's `parse` /
 * `stringify` maps: every key that is not one of the screen's own path params.
 * (Arbitrary `?key=value` pairs also pass through at runtime, but these keys
 * are the only statically knowable ones.)
 */
function queryParamsOf(
  ownParts: PatternPart[],
  parse: ReactNavigationParseConfig | undefined,
  stringify: ReactNavigationStringifyConfig | undefined,
): Param[] {
  const ownPathParams = new Set(ownParts.map((p) => p.param).filter((p) => p !== undefined));
  const params: Param[] = [];
  const seen = new Set<string>();
  for (const [name, tsType] of [
    ...Object.keys(parse ?? {}).map((n) => [n, 'unknown (custom parse)'] as const),
    ...Object.keys(stringify ?? {}).map((n) => [n, 'string'] as const),
  ]) {
    if (ownPathParams.has(name) || seen.has(name)) {
      continue;
    }
    seen.add(name);
    params.push({ name, kind: 'query', optional: true, tsType });
  }
  return params;
}

/** Mutable state threaded through the walk. */
interface WalkState {
  routes: Route[];
  diagnostics: Diagnostic[];
  pathlessScreens: string[];
  /** pattern -> route-name chains that own it, for the duplicate check. */
  patternChains: Map<string, string[][]>;
  /**
   * Static segments from the config's top-level `path`. Prefixed to every
   * pattern - `exact: true` does not escape it, because `getStateFromPath`
   * strips it from the URL before any matching happens.
   */
  rootSegments: string[];
  sourceFile?: string;
}

/** What a parent navigator contributes to its children's patterns. */
interface ParentContext {
  /** Authored segments accumulated so far, e.g. `['feed']`. */
  segments: string[];
  /** Params those segments carry, already typed by their owning screens. */
  params: Param[];
  /** Screen names from the root, e.g. `['HomeTabs', 'Feed']`. */
  ancestry: string[];
}

/**
 * Emit one route, running the same duplicate-pattern check React Navigation
 * performs (`checkForDuplicatedConfigs`): the same pattern is fine when one
 * owner is an ancestor of the other (a navigator and its initial child), and a
 * runtime crash otherwise.
 */
function emitRoute(
  state: WalkState,
  ancestry: string[],
  base: { segments: string[]; params: Param[] },
  ownParts: PatternPart[],
  parse: ReactNavigationParseConfig | undefined,
  stringify: ReactNavigationStringifyConfig | undefined,
): void {
  const segments = [...state.rootSegments, ...base.segments, ...ownParts.map((p) => p.segment)];
  const route: Route = {
    name: ancestry.join('/'),
    pattern: `/${segments.join('/')}`,
    params: [
      ...base.params,
      ...paramsOf(ownParts, parse),
      ...queryParamsOf(ownParts, parse, stringify),
    ],
    ...(state.sourceFile !== undefined ? { sourceFile: state.sourceFile } : {}),
    exact: !segments.includes('*'),
  };

  const existingChains = state.patternChains.get(route.pattern);
  if (existingChains !== undefined) {
    const conflict = existingChains.find((chain) => !chainsIntersect(chain, ancestry));
    if (conflict !== undefined) {
      state.diagnostics.push({
        severity: 'error',
        code: 'DUPLICATE_PATTERN',
        message: `pattern '${route.pattern}' resolves to both '${conflict.join(' > ')}' and '${ancestry.join(' > ')}'. React Navigation throws on this configuration when a link arrives.`,
        route,
        fix: 'give each screen a unique path, or restructure so one screen is nested inside the other.',
      });
    }
    existingChains.push([...ancestry]);
  } else {
    state.patternChains.set(route.pattern, [[...ancestry]]);
  }

  state.routes.push(route);
}

/** Walk one screen entry and recurse into its nested screens. */
function walkScreen(state: WalkState, name: string, config: unknown, parent: ParentContext): void {
  const ancestry = [...parent.ancestry, name];

  if (typeof config === 'string') {
    let parts: PatternPart[];
    try {
      parts = getPatternParts(config);
    } catch (error) {
      state.diagnostics.push({
        severity: 'error',
        code: 'INVALID_PATH_PATTERN',
        message: `screen '${ancestry.join(' > ')}': ${error instanceof Error ? error.message : String(error)}`,
        fix: 'fix the path string - React Navigation throws on it when a link arrives.',
      });
      return;
    }
    emitRoute(state, ancestry, parent, parts, undefined, undefined);
    return;
  }

  if (typeof config !== 'object' || config === null) {
    state.diagnostics.push({
      severity: 'warn',
      code: 'INVALID_SCREEN_CONFIG',
      message: `screen '${ancestry.join(' > ')}' has a ${config === null ? 'null' : typeof config} value; expected a path string or a config object. Subtree skipped.`,
    });
    return;
  }

  const screen = config as ReactNavigationPathConfig;

  const unknownKeys = Object.keys(screen).filter((key) => !SCREEN_CONFIG_KEYS.has(key));
  if (unknownKeys.length > 0) {
    state.diagnostics.push({
      severity: 'warn',
      code: 'INVALID_SCREEN_CONFIG',
      message: `screen '${ancestry.join(' > ')}' has unknown key${unknownKeys.length === 1 ? '' : 's'} ${unknownKeys.map((k) => `'${k}'`).join(', ')}; React Navigation rejects extraneous keys in development builds.`,
      fix: `allowed keys: ${[...SCREEN_CONFIG_KEYS].join(', ')}.`,
    });
  }

  const hasPath = typeof screen.path === 'string';
  let ownParts: PatternPart[] | undefined;

  if (hasPath) {
    try {
      ownParts = getPatternParts(screen.path as string);
    } catch (error) {
      state.diagnostics.push({
        severity: 'error',
        code: 'INVALID_PATH_PATTERN',
        message: `screen '${ancestry.join(' > ')}': ${error instanceof Error ? error.message : String(error)}`,
        fix: 'fix the path string - React Navigation throws on it when a link arrives.',
      });
    }
  }

  if (ownParts !== undefined) {
    // Main route. `exact: true` drops the parent prefix (and its params).
    const base = screen.exact === true ? { segments: [], params: [] } : parent;
    emitRoute(state, ancestry, base, ownParts, screen.parse, screen.stringify);

    // Aliases. Mirrors createNormalizedConfigs: a string alias (and a
    // non-exact object alias) inherits the parent prefix even when the main
    // path is exact; only an object alias's own `exact: true` is absolute.
    for (const alias of screen.alias ?? []) {
      walkAlias(state, ancestry, parent, alias, screen.parse);
    }
  } else if (screen.alias !== undefined && screen.alias.length > 0) {
    state.diagnostics.push({
      severity: 'error',
      code: 'ALIAS_WITHOUT_PATH',
      message: `screen '${ancestry.join(' > ')}' declares 'alias' but no 'path'; React Navigation throws on this.`,
      fix: "add a 'path' to the screen, or remove the alias.",
    });
  }

  const nested = screen.screens;
  if (nested !== undefined && typeof nested === 'object') {
    const childBase =
      ownParts !== undefined
        ? {
            segments: [
              ...(screen.exact === true ? [] : parent.segments),
              ...ownParts.map((p) => p.segment),
            ],
            params: [
              ...(screen.exact === true ? [] : parent.params),
              ...paramsOf(ownParts, screen.parse),
            ],
          }
        : parent;
    for (const childName of Object.keys(nested)) {
      walkScreen(state, childName, (nested as ReactNavigationScreensMap)[childName], {
        ...childBase,
        ancestry,
      });
    }
  } else if (!hasPath) {
    state.pathlessScreens.push(ancestry.join('/'));
  }
}

/** Emit the extra route an `alias` entry contributes. */
function walkAlias(
  state: WalkState,
  ancestry: string[],
  parent: ParentContext,
  alias: ReactNavigationAlias,
  screenParse: ReactNavigationParseConfig | undefined,
): void {
  let path: string;
  let parse: ReactNavigationParseConfig | undefined;
  let base: { segments: string[]; params: Param[] };

  if (typeof alias === 'string') {
    path = alias;
    parse = screenParse;
    base = parent;
  } else if (typeof alias === 'object' && alias !== null && typeof alias.path === 'string') {
    path = alias.path;
    parse = alias.parse;
    base = alias.exact === true ? { segments: [], params: [] } : parent;
  } else {
    state.diagnostics.push({
      severity: 'warn',
      code: 'INVALID_SCREEN_CONFIG',
      message: `screen '${ancestry.join(' > ')}' has an alias entry that is neither a string nor an object with a 'path'; entry skipped.`,
    });
    return;
  }

  let parts: PatternPart[];
  try {
    parts = getPatternParts(path);
  } catch (error) {
    state.diagnostics.push({
      severity: 'error',
      code: 'INVALID_PATH_PATTERN',
      message: `screen '${ancestry.join(' > ')}' alias '${path}': ${error instanceof Error ? error.message : String(error)}`,
      fix: 'fix the alias path string - React Navigation throws on it when a link arrives.',
    });
    return;
  }

  emitRoute(state, ancestry, base, parts, parse, undefined);
}

/**
 * Build a normalized {@link RouteTable} from a React Navigation linking
 * configuration - either a full `LinkingOptions` object (`{ prefixes, config }`)
 * or a bare config (`{ screens }`). Mirrors the pattern semantics of
 * `@react-navigation/core` 7.x `getStateFromPath`: nested paths concatenate
 * unless `exact: true`, `alias` adds extra incoming patterns, and query params
 * are derived from `parse`/`stringify` keys.
 *
 * Never throws: malformed input becomes error diagnostics and an empty table.
 */
export function buildRouteTable(
  linking: unknown,
  options: BuildRouteTableOptions = {},
): ReactNavigationScanResult {
  const diagnostics: Diagnostic[] = [];
  const empty = (message: string): ReactNavigationScanResult => ({
    table: { routes: [], sourceType: 'react-navigation' },
    diagnostics: [
      ...diagnostics,
      {
        severity: 'error',
        code: 'CONFIG_INVALID_SHAPE',
        message,
        fix: 'export React Navigation LinkingOptions ({ prefixes, config: { screens } }) or a bare { screens } config.',
      },
    ],
    prefixes: [],
    pathlessScreens: [],
  });

  if (typeof linking !== 'object' || linking === null) {
    return empty(
      `expected a linking configuration object, got ${linking === null ? 'null' : typeof linking}.`,
    );
  }

  const value = linking as Record<string, unknown>;
  let config: ReactNavigationLinkingConfig;
  let prefixes: string[] = [];
  let isLinkingOptions = false;

  if (typeof value['screens'] === 'object' && value['screens'] !== null) {
    config = value as ReactNavigationLinkingConfig;
  } else if (typeof value['config'] === 'object' && value['config'] !== null) {
    isLinkingOptions = true;
    config = value['config'] as ReactNavigationLinkingConfig;
  } else if (Array.isArray(value['prefixes'])) {
    isLinkingOptions = true;
    config = { screens: {} };
  } else {
    return empty(
      'the value has neither a `screens` map nor a `config` object - it does not look like a React Navigation linking configuration.',
    );
  }

  if (isLinkingOptions) {
    if (Array.isArray(value['prefixes'])) {
      prefixes = (value['prefixes'] as unknown[]).filter((p): p is string => typeof p === 'string');
    }
  }
  // A bare config cannot carry prefixes, so only LinkingOptions-shaped input
  // without them is worth flagging.
  if (isLinkingOptions && prefixes.length === 0) {
    diagnostics.push({
      severity: 'warn',
      code: 'NO_PREFIXES',
      message: 'LinkingOptions has no `prefixes`; the app will not receive any deep links.',
      fix: "add prefixes, e.g. prefixes: ['myapp://', 'https://example.com'].",
    });
  }

  const state: WalkState = {
    routes: [],
    diagnostics,
    pathlessScreens: [],
    patternChains: new Map(),
    rootSegments: [],
    ...(options.sourceFile !== undefined ? { sourceFile: options.sourceFile } : {}),
  };

  const rootContext: ParentContext = { segments: [], params: [], ancestry: [] };
  if (typeof config.path === 'string') {
    if (config.path.includes(':')) {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_PATH_PATTERN',
        message: `the top-level 'path' ('${config.path}') cannot contain params; React Navigation throws on this.`,
        fix: 'use a static prefix path, or move the params into a screen path.',
      });
    } else {
      state.rootSegments = config.path.split('/').filter((s) => s !== '');
    }
  }

  const screens = config.screens;
  if (typeof screens !== 'object' || screens === null || Object.keys(screens).length === 0) {
    diagnostics.push({
      severity: 'warn',
      code: 'NO_SCREENS',
      message:
        'the linking configuration has no screens; React Navigation falls back to treating URL segments as route names.',
      fix: 'declare your URL patterns under config.screens.',
    });
    return {
      table: { routes: [], sourceType: 'react-navigation' },
      diagnostics,
      prefixes,
      pathlessScreens: [],
    };
  }

  for (const name of Object.keys(screens)) {
    walkScreen(state, name, screens[name], rootContext);
  }

  return {
    table: { routes: state.routes, sourceType: 'react-navigation' },
    diagnostics: state.diagnostics,
    prefixes,
    pathlessScreens: state.pathlessScreens,
  };
}
