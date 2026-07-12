import type { ReactNavigationScanResult } from './scan.js';
import { buildRouteTable } from './scan.js';
import { loadLinkingModule } from './loader.js';

/**
 * Load a React Navigation linking-config module with jiti and build its route
 * table in one step - the entry point `rndl routes --config` uses.
 *
 * `specifier` is `<module>[#<export>]`, e.g. `src/navigation/linking.ts#linking`;
 * relative paths resolve from `options.cwd` (default: `process.cwd()`).
 *
 * Never throws: load and scan failures surface as error diagnostics with an
 * empty table.
 */
export async function scanLinkingModule(
  specifier: string,
  options: { cwd?: string } = {},
): Promise<ReactNavigationScanResult> {
  const loaded = await loadLinkingModule(specifier, options);
  if (loaded.value === undefined) {
    return {
      table: { routes: [], sourceType: 'react-navigation' },
      diagnostics: loaded.diagnostics,
      prefixes: [],
      pathlessScreens: [],
    };
  }
  const result = buildRouteTable(loaded.value, { sourceFile: loaded.sourceFile });
  return { ...result, diagnostics: [...loaded.diagnostics, ...result.diagnostics] };
}

export { buildRouteTable } from './scan.js';
export type { BuildRouteTableOptions, ReactNavigationScanResult } from './scan.js';
export { loadLinkingModule, parseConfigSpecifier } from './loader.js';
export type { LoadedLinkingModule, ParsedConfigSpecifier } from './loader.js';
export type {
  ReactNavigationAlias,
  ReactNavigationLinkingConfig,
  ReactNavigationLinkingOptions,
  ReactNavigationParseConfig,
  ReactNavigationPathConfig,
  ReactNavigationScreenConfig,
  ReactNavigationScreensMap,
  ReactNavigationStringifyConfig,
} from './types.js';
export type { Diagnostic, Param, ParamKind, Route, RouteTable } from '@deeplink-devtools/core';
