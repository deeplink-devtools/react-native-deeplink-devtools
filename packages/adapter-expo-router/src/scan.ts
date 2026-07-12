import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Diagnostic, Param, Route, RouteTable } from '@deeplink-devtools/core';

/**
 * A `_layout` file discovered during the scan. Layouts are structural - they
 * never appear in the {@link RouteTable} - but their anchoring settings are
 * useful metadata for tooling.
 */
export interface ExpoRouterLayout {
  /** Path of the layout file, relative to the scanned app directory (forward slashes). */
  sourceFile: string;
  /**
   * The anchored initial route, when statically detectable: the value of
   * `unstable_settings.anchor` (SDK 54+ name) or the legacy
   * `unstable_settings.initialRouteName`. Extraction is a best-effort static
   * scan of the source text; dynamically computed settings are not resolved.
   */
  anchor?: string;
}

/**
 * Everything {@link buildRouteTable} learned about an Expo Router app directory.
 */
export interface ExpoRouterScanResult {
  /** Navigable routes, in deterministic (sorted-walk) order. */
  table: RouteTable;
  /**
   * Findings produced while scanning. Codes emitted by this adapter:
   *
   * - `APP_DIR_NOT_FOUND` (error) - the directory does not exist.
   * - `NO_ROUTES_FOUND` (warn) - the directory exists but holds no route files.
   * - `UNKNOWN_CONVENTION` (warn) - a file name this adapter does not recognize; the file is skipped, never fatal.
   * - `MISPLACED_SPECIAL_FILE` (warn) - `+html`/`+native-intent`/`+middleware` outside the app-directory root.
   * - `PLATFORM_ROUTE_NO_FALLBACK` (warn) - a platform-specific route (`.ios`/`.android`/`.native`/`.web`) with no extensionless sibling; Expo Router refuses to bundle this.
   * - `PLATFORM_API_ROUTE` (warn) - an API route with a platform extension; Expo Router refuses to bundle this.
   * - `DUPLICATE_PATTERN` (warn) - two route files resolve to the same URL pattern (usually intentional shared routes across groups; the router disambiguates by navigation context).
   */
  diagnostics: Diagnostic[];
  /**
   * Server API routes (`<name>+api.ts`), relative to the app directory. These
   * are excluded from {@link table} because they are never navigable screens.
   */
  apiRoutes: string[];
  /** Every `_layout` file found, with best-effort anchoring metadata. */
  layouts: ExpoRouterLayout[];
}

/** Route files are JS/TS modules; everything else in the app directory is ignored. */
const ROUTE_FILE_RE = /\.[jt]sx?$/;

/** Platform extensions Expo Router resolves, e.g. `about.web.tsx`. */
const PLATFORM_SUFFIXES = new Set(['ios', 'android', 'native', 'web']);

/** Specials that live only at the app-directory root and are never routes. */
const ROOT_ONLY_SPECIALS = new Set(['+html', '+native-intent', '+middleware']);

/** Match `[param]` -> `param` and `[...param]` -> `...param` (mirrors expo-router's matcher). */
const DYNAMIC_SEGMENT_RE = /^\[([^[\]]+)\]$/;

/** A group segment is fully wrapped in parentheses, e.g. `(tabs)` or `(a,b)`. */
const GROUP_SEGMENT_RE = /^\(.+\)$/;

interface RouteFile {
  /** e.g. `users/[id]/index.tsx` */
  relativePath: string;
  /** Path without extension and platform suffix, e.g. `users/[id]/index`. */
  routeName: string;
  /** Platform suffix when present, e.g. `web` for `docs/[page].web.tsx`. */
  platform?: string;
}

/** Recursively collect route-candidate files, sorted for cross-platform determinism. */
function walk(directory: string, prefix: string, out: string[]): void {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }
    if (entry.isDirectory()) {
      walk(join(directory, entry.name), `${prefix}${entry.name}/`, out);
    } else if (entry.isFile() && ROUTE_FILE_RE.test(entry.name)) {
      out.push(`${prefix}${entry.name}`);
    }
  }
}

/** Split a relative file path into its route name and optional platform suffix. */
function parseRouteFile(relativePath: string): RouteFile {
  const withoutExt = relativePath.replace(ROUTE_FILE_RE, '');
  const segments = withoutExt.split('/');
  const last = segments[segments.length - 1] as string;
  const dotIndex = last.lastIndexOf('.');
  if (dotIndex !== -1) {
    const suffix = last.slice(dotIndex + 1);
    if (PLATFORM_SUFFIXES.has(suffix)) {
      segments[segments.length - 1] = last.slice(0, dotIndex);
      return { relativePath, routeName: segments.join('/'), platform: suffix };
    }
  }
  return { relativePath, routeName: withoutExt };
}

function lastSegmentOf(routeName: string): string {
  return routeName.slice(routeName.lastIndexOf('/') + 1);
}

/**
 * Best-effort static extraction of the anchored route from a `_layout` file:
 * reads `unstable_settings.anchor` (preferred) or the legacy
 * `unstable_settings.initialRouteName` from the source text.
 */
function scanLayoutAnchor(absolutePath: string): string | undefined {
  let text: string;
  try {
    text = readFileSync(absolutePath, 'utf8');
  } catch {
    return undefined;
  }
  const block = text.match(/unstable_settings\s*=\s*\{([\s\S]*?)\}/)?.[1];
  if (block === undefined) {
    return undefined;
  }
  return (
    block.match(/anchor\s*:\s*['"]([^'"]+)['"]/)?.[1] ??
    block.match(/initialRouteName\s*:\s*['"]([^'"]+)['"]/)?.[1]
  );
}

interface PatternBuild {
  pattern: string;
  params: Param[];
  endsInCatchAll: boolean;
}

/**
 * Convert a route name into its URL pattern, mirroring expo-router semantics:
 * groups are stripped, a trailing `index` maps to the parent path, `[x]`
 * becomes `:x`, `[...x]` becomes `*x`, and `+not-found` becomes `*not-found`.
 * Returns `undefined` when a segment is not a recognized convention.
 */
function buildPattern(routeName: string): PatternBuild | undefined {
  const segments = routeName.split('/');
  const parts: string[] = [];
  const params: Param[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i] as string;
    const isLast = i === segments.length - 1;

    if (isLast && segment === 'index') {
      continue;
    }
    if (GROUP_SEGMENT_RE.test(segment)) {
      continue;
    }
    if (isLast && segment === '+not-found') {
      parts.push('*not-found');
      params.push({ name: 'not-found', kind: 'catch-all', optional: true, tsType: 'string[]' });
      continue;
    }
    const dynamic = DYNAMIC_SEGMENT_RE.exec(segment)?.[1];
    if (dynamic !== undefined) {
      if (dynamic.startsWith('...')) {
        const name = dynamic.slice(3);
        parts.push(`*${name}`);
        params.push({ name, kind: 'catch-all', optional: false, tsType: 'string[]' });
      } else {
        parts.push(`:${dynamic}`);
        params.push({ name: dynamic, kind: 'path', optional: false, tsType: 'string' });
      }
      continue;
    }
    // A leftover bracket, parenthesis, or plus sign means a convention this
    // adapter does not understand - the caller reports it and skips the file.
    if (/[[\]()+]/.test(segment)) {
      return undefined;
    }
    parts.push(segment);
  }

  return {
    pattern: `/${parts.join('/')}`,
    params,
    // A pattern whose final segment is a catch-all matches a whole subtree,
    // so it is not an exact match.
    endsInCatchAll: parts[parts.length - 1]?.startsWith('*') ?? false,
  };
}

/**
 * Scan an Expo Router app directory (`app/` or `src/app/`) into a normalized
 * {@link RouteTable} plus diagnostics and metadata.
 *
 * The scan is purely file-name based - no user code is imported or executed  -
 * and never throws on unrecognized conventions; those surface as
 * `UNKNOWN_CONVENTION` warnings instead. Verified against expo-router 57
 * (SDK 57) semantics.
 *
 * @param appDir - Absolute or cwd-relative path to the app directory.
 */
export function buildRouteTable(appDir: string): ExpoRouterScanResult {
  const diagnostics: Diagnostic[] = [];
  const apiRoutes: string[] = [];
  const layouts: ExpoRouterLayout[] = [];
  const routes: Route[] = [];

  if (!existsSync(appDir) || !statSync(appDir).isDirectory()) {
    diagnostics.push({
      severity: 'error',
      code: 'APP_DIR_NOT_FOUND',
      message: `App directory not found: ${appDir}`,
      fix: 'Pass --app-dir <path> pointing at your Expo Router app directory (usually app/ or src/app/).',
    });
    return { table: { routes, sourceType: 'expo-router' }, diagnostics, apiRoutes, layouts };
  }

  const files: string[] = [];
  walk(appDir, '', files);

  if (files.length === 0) {
    diagnostics.push({
      severity: 'warn',
      code: 'NO_ROUTES_FOUND',
      message: `No route files (.js/.jsx/.ts/.tsx) found in ${appDir}.`,
      fix: 'Check that this is the Expo Router app directory, or pass --app-dir explicitly.',
    });
    return { table: { routes, sourceType: 'expo-router' }, diagnostics, apiRoutes, layouts };
  }

  // Group platform variants (about.tsx / about.web.tsx) under one route name.
  const byRouteName = new Map<string, RouteFile[]>();
  for (const relativePath of files) {
    const file = parseRouteFile(relativePath);
    const group = byRouteName.get(file.routeName);
    if (group) {
      group.push(file);
    } else {
      byRouteName.set(file.routeName, [file]);
    }
  }

  for (const [routeName, variants] of byRouteName) {
    const fallback = variants.find((v) => v.platform === undefined);
    const sourceFile = (fallback ?? (variants[0] as RouteFile)).relativePath;
    const last = lastSegmentOf(routeName);

    if (last === '_layout') {
      for (const variant of variants) {
        layouts.push({
          sourceFile: variant.relativePath,
          anchor: scanLayoutAnchor(join(appDir, variant.relativePath)),
        });
      }
      continue;
    }

    if (last.endsWith('+api')) {
      for (const variant of variants) {
        if (variant.platform !== undefined) {
          diagnostics.push({
            severity: 'warn',
            code: 'PLATFORM_API_ROUTE',
            message: `API route ${variant.relativePath} has a platform extension; Expo Router refuses to bundle it.`,
            fix: `Remove '.${variant.platform}' from the file name.`,
          });
        } else {
          apiRoutes.push(variant.relativePath);
        }
      }
      continue;
    }

    if (ROOT_ONLY_SPECIALS.has(last)) {
      if (routeName !== last) {
        diagnostics.push({
          severity: 'warn',
          code: 'MISPLACED_SPECIAL_FILE',
          message: `${sourceFile} is only recognized at the app-directory root and was ignored here.`,
          fix: `Move it to the root of the app directory.`,
        });
      }
      continue;
    }

    const build = buildPattern(routeName);
    if (build === undefined) {
      diagnostics.push({
        severity: 'warn',
        code: 'UNKNOWN_CONVENTION',
        message: `Unrecognized route file name: ${sourceFile}. The file was skipped.`,
        fix: 'Rename it to a supported convention ([param], [...catchAll], (group), index, _layout, +not-found), or report this if it is a new Expo Router convention.',
      });
      continue;
    }

    if (fallback === undefined) {
      diagnostics.push({
        severity: 'warn',
        code: 'PLATFORM_ROUTE_NO_FALLBACK',
        message: `${sourceFile} has only platform-specific variants; Expo Router requires a sibling without a platform extension.`,
        fix: `Add ${routeName}.tsx next to the platform variants.`,
      });
    }

    routes.push({
      name: routeName,
      pattern: build.pattern,
      params: build.params,
      sourceFile,
      exact: !build.endsInCatchAll,
    });
  }

  // Same URL pattern from multiple files: legitimate for shared routes across
  // groups, but worth surfacing - deep links resolve to only one of them.
  const byPattern = new Map<string, Route[]>();
  for (const route of routes) {
    const group = byPattern.get(route.pattern);
    if (group) {
      group.push(route);
    } else {
      byPattern.set(route.pattern, [route]);
    }
  }
  for (const [pattern, group] of byPattern) {
    if (group.length > 1) {
      diagnostics.push({
        severity: 'warn',
        code: 'DUPLICATE_PATTERN',
        message: `${group.length} route files share the URL pattern ${pattern}: ${group
          .map((r) => r.sourceFile)
          .join(', ')}. Deep links open the one chosen by the router's group context.`,
        route: group[1],
      });
    }
  }

  return { table: { routes, sourceType: 'expo-router' }, diagnostics, apiRoutes, layouts };
}
