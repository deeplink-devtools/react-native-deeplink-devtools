/**
 * Identifies which router an entity was derived from.
 */
export type RouteSourceType = 'expo-router' | 'react-navigation';

/**
 * Where a parameter appears in a deep-link URL.
 *
 * - `path` — a single URL segment, e.g. `:id` in `/users/:id`
 * - `query` — a query-string parameter, e.g. `?ref=...`
 * - `catch-all` — a parameter matching one or more trailing segments, e.g. `*slug`
 */
export type ParamKind = 'path' | 'query' | 'catch-all';

/**
 * A single parameter accepted by a {@link Route}.
 */
export interface Param {
  /** Parameter name as it appears in the route definition, e.g. `id`. */
  name: string;
  /** Where the parameter appears in the URL. */
  kind: ParamKind;
  /** Whether a URL can match the route without providing this parameter. */
  optional: boolean;
  /**
   * The TypeScript type the router hands the app for this parameter, as source text
   * (e.g. `'string'`, `'string[]'`). Routers with custom parse functions report
   * `'unknown (custom parse)'`.
   */
  tsType: string;
}

/**
 * One navigable route in an app, normalized across routers.
 */
export interface Route {
  /** Router-native identifier: a navigator route name or an app-directory file path. */
  name: string;
  /** URL pattern the route matches, e.g. `/users/:id` or `/posts/*slug`. */
  pattern: string;
  /** Parameters the route accepts. */
  params: Param[];
  /** Source file the route was derived from, when known. */
  sourceFile?: string;
  /** Whether the pattern must match the full path (no deeper segments). */
  exact: boolean;
}

/**
 * The complete set of deep-linkable routes extracted from an app, plus its origin.
 */
export interface RouteTable {
  /** Every route the adapter discovered, in source order. */
  routes: Route[];
  /** Which router adapter produced this table. */
  sourceType: RouteSourceType;
}

/**
 * A validation or analysis finding, designed to be actionable: `message` states the
 * problem, `fix` states what to do about it.
 */
export interface Diagnostic {
  /** `error` fails CI (non-zero exit); `warn` is informational. */
  severity: 'error' | 'warn';
  /** Stable machine-readable code, e.g. `AASA_MISSING_ROUTE`. */
  code: string;
  /** Human-readable description of what is wrong. */
  message: string;
  /** The route the finding applies to, when route-specific. */
  route?: Route;
  /** Concrete remediation, when one is known. */
  fix?: string;
}

export * from './validate/index.js';
