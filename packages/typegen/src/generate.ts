import type { Param, Route, RouteSourceType, RouteTable } from '@deeplink-devtools/core';

/**
 * Options controlling {@link generateDeepLinkTypes}.
 */
export interface GenerateOptions {
  /**
   * The scheme/prefix baked into the generated `buildDeepLink` as its default
   * (already normalized, e.g. `myapp://` or `https://example.com`). An empty
   * string makes `buildDeepLink` return a path-only URL unless a prefix is
   * passed at the call site.
   */
  defaultPrefix: string;
}

/** Matches a bare TS identifier that can be an unquoted object key. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Convert a normalized route pattern into the key used in the generated types.
 * Expo Router keys use the bracket form its developers author and see in Expo's
 * own typed `Href` (`/users/[id]`, `/posts/[...slug]`); React Navigation keeps
 * the colon pattern verbatim (`/users/:id`). The underlying `Route.pattern`
 * (colon form) is what {@link buildRouteUrl} consumes, so this is purely the
 * developer-facing key.
 */
export function patternToKey(pattern: string, sourceType: RouteSourceType): string {
  if (sourceType !== 'expo-router') {
    return pattern;
  }
  return pattern
    .split('/')
    .map((segment) => {
      if (segment === '') {
        return segment;
      }
      if (segment.startsWith('*')) {
        const name = segment.slice(1);
        return name === '' ? segment : `[...${name}]`;
      }
      if (segment.startsWith(':')) {
        let body = segment.slice(1);
        const paren = body.indexOf('(');
        if (paren !== -1) {
          body = body.slice(0, paren);
        }
        if (body.endsWith('?')) {
          body = body.slice(0, -1);
        }
        return `[${body}]`;
      }
      return segment;
    })
    .join('/');
}

/** A query param, or a param the router itself marks optional, is optional to supply. */
function isOptional(param: Param): boolean {
  return param.optional || param.kind === 'query';
}

/** Quote an object key unless it is already a bare identifier. */
function propName(name: string): string {
  return IDENTIFIER.test(name) ? name : JSON.stringify(name);
}

/**
 * The TypeScript type for one param. `building` (what `buildDeepLink` accepts)
 * is always `string` — path values, catch-all values (as one `a/b/c` string),
 * and query values all go into the URL as strings. `reading` (what
 * `useTypedParams` returns) reflects what the router hands back: `string`,
 * `string[]` for catch-all, or `unknown` for a React Navigation custom `parse`.
 */
function valueType(param: Param, mode: 'building' | 'reading'): string {
  if (mode === 'building') {
    return 'string';
  }
  if (param.tsType === 'unknown (custom parse)') {
    return 'unknown';
  }
  return param.tsType;
}

/** Emit the `{ id: string; ref?: string }` object type for a route's params. */
function paramsType(params: Param[], mode: 'building' | 'reading'): string {
  if (params.length === 0) {
    return 'Record<string, never>';
  }
  const entries = params.map(
    (param) => `${propName(param.name)}${isOptional(param) ? '?' : ''}: ${valueType(param, mode)}`,
  );
  return `{ ${entries.join('; ')} }`;
}

/** One de-duplicated route, paired with its developer-facing key. */
interface KeyedRoute {
  key: string;
  route: Route;
}

/**
 * De-duplicate routes by key, first occurrence winning. A `RouteTable` can carry
 * structurally-distinct routes that share a URL pattern (a React Navigation
 * navigator and its initial child, for example); they collapse to one key.
 */
function keyedRoutes(table: RouteTable): KeyedRoute[] {
  const seen = new Set<string>();
  const out: KeyedRoute[] = [];
  for (const route of table.routes) {
    const key = patternToKey(route.pattern, table.sourceType);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({ key, route });
  }
  return out;
}

/** The router-specific import + `useTypedParams` body. */
function routerBindings(sourceType: RouteSourceType): { import: string; hookBody: string } {
  if (sourceType === 'expo-router') {
    return {
      import: "import { useLocalSearchParams } from 'expo-router';",
      hookBody: 'return useLocalSearchParams() as unknown as DeepLinkParams[R];',
    };
  }
  return {
    import: "import { useRoute } from '@react-navigation/native';",
    hookBody: 'return (useRoute().params ?? {}) as unknown as DeepLinkParams[R];',
  };
}

/** Serialize a `Route` as a compact object literal for the runtime `ROUTES` map. */
function routeLiteral(route: Route): string {
  const value: Route = {
    name: route.name,
    pattern: route.pattern,
    params: route.params,
    exact: route.exact,
  };
  return JSON.stringify(value);
}

/**
 * Generate a self-contained TypeScript module from a {@link RouteTable}: a
 * `DeepLinkRoutes` map (route key -> params to build a link), a `DeepLinkParams`
 * map (route key -> params the router hands the screen), a compile-time-checked
 * `buildDeepLink(route, params)` returning a full deep link, and a
 * `useTypedParams<Route>()` hook for the table's router. Pure; never throws.
 *
 * React Navigation params defined with a custom `parse` function are typed
 * `unknown` in `DeepLinkParams`, since their runtime type is not statically
 * knowable.
 */
export function generateDeepLinkTypes(table: RouteTable, options: GenerateOptions): string {
  const routes = keyedRoutes(table);
  const bindings = routerBindings(table.sourceType);

  const buildingMembers = routes
    .map(({ key, route }) => `  ${JSON.stringify(key)}: ${paramsType(route.params, 'building')};`)
    .join('\n');
  const readingMembers = routes
    .map(({ key, route }) => `  ${JSON.stringify(key)}: ${paramsType(route.params, 'reading')};`)
    .join('\n');
  const routesMembers = routes
    .map(({ key, route }) => `  ${JSON.stringify(key)}: ${routeLiteral(route)},`)
    .join('\n');

  return `/* eslint-disable */
// AUTO-GENERATED by \`rndl typegen\`. Do not edit by hand.
// Regenerate this file instead of editing it.
import { buildRouteUrl, type Route } from '@deeplink-devtools/core';
${bindings.import}

/** Params accepted by {@link buildDeepLink}, keyed by route. All values are strings (they go into the URL). */
export interface DeepLinkRoutes {
${buildingMembers}
}

/** Params {@link useTypedParams} returns, keyed by route, as the router hands them to the screen. */
export interface DeepLinkParams {
${readingMembers}
}

/** The scheme/prefix baked in at generation time; pass a prefix to {@link buildDeepLink} to override it. */
const DEFAULT_PREFIX = ${JSON.stringify(options.defaultPrefix)};

const ROUTES: Record<keyof DeepLinkRoutes, Route> = {
${routesMembers}
};

/**
 * Build a deep-link URL for a known route. The route key and its params are
 * checked at compile time, so a wrong route or a missing/mistyped param fails
 * \`tsc\`. Throws if a required param is not supplied at runtime.
 */
export function buildDeepLink<R extends keyof DeepLinkRoutes>(
  route: R,
  params: DeepLinkRoutes[R],
  prefix: string = DEFAULT_PREFIX,
): string {
  const result = buildRouteUrl(ROUTES[route], params as unknown as Record<string, string>, prefix);
  if (result.url === undefined) {
    throw new Error(
      \`buildDeepLink: cannot build "\${String(route)}" without params: \${result.missing.join(', ')}\`,
    );
  }
  return result.url;
}

/**
 * Read the current screen's deep-link params, typed for the given route. The
 * route key selects the param shape; the returned values are what the router
 * provides (strings, string arrays for catch-all, or \`unknown\` for a React
 * Navigation custom \`parse\`).
 */
export function useTypedParams<R extends keyof DeepLinkParams>(): DeepLinkParams[R] {
  ${bindings.hookBody}
}
`;
}
