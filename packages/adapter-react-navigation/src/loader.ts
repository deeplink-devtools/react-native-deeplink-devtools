import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';
import type { Diagnostic } from '@deeplink-devtools/core';

/** A `--config` specifier split into its module path and optional export name. */
export interface ParsedConfigSpecifier {
  /** e.g. `src/navigation/linking.ts` */
  modulePath: string;
  /** The part after `#`, e.g. `linking`; absent when no export was named. */
  exportName?: string;
}

/**
 * Split a `<module>[#<export>]` specifier (as accepted by
 * `rndl routes --config`) on its last `#`.
 */
export function parseConfigSpecifier(specifier: string): ParsedConfigSpecifier {
  const hash = specifier.lastIndexOf('#');
  if (hash === -1 || hash === specifier.length - 1) {
    return { modulePath: hash === -1 ? specifier : specifier.slice(0, hash) };
  }
  return { modulePath: specifier.slice(0, hash), exportName: specifier.slice(hash + 1) };
}

/** What {@link loadLinkingModule} produced. */
export interface LoadedLinkingModule {
  /** The selected export; `undefined` when loading failed (see diagnostics). */
  value: unknown;
  /** Load-time findings: `CONFIG_LOAD_FAILED` or `CONFIG_EXPORT_NOT_FOUND`. */
  diagnostics: Diagnostic[];
  /** The module path relative to `cwd` (forward slashes), for `Route.sourceFile`. */
  sourceFile: string;
}

const ISOLATED_MODULE_GUIDANCE =
  'your linking module likely runs app code at import time (e.g. it imports react-native or a component). ' +
  'Move the linking config into an isolated module that only exports plain data and parse/stringify ' +
  'functions (react-navigation imports are fine as `import type`), then point --config at that file.';

/**
 * Import a linking-config module with jiti (handles TypeScript and ESM) and
 * pick the requested export. Without an explicit `#export`, the default
 * export is used, falling back to a `linking` named export.
 *
 * Never throws: failures come back as `CONFIG_LOAD_FAILED` /
 * `CONFIG_EXPORT_NOT_FOUND` diagnostics with an `undefined` value.
 */
export async function loadLinkingModule(
  specifier: string,
  options: { cwd?: string } = {},
): Promise<LoadedLinkingModule> {
  const cwd = options.cwd ?? process.cwd();
  const { modulePath, exportName } = parseConfigSpecifier(specifier);
  const absolutePath = resolve(cwd, modulePath);
  const sourceFile = relative(cwd, absolutePath).replaceAll('\\', '/');

  if (!existsSync(absolutePath)) {
    return {
      value: undefined,
      sourceFile,
      diagnostics: [
        {
          severity: 'error',
          code: 'CONFIG_LOAD_FAILED',
          message: `linking module not found: ${absolutePath}`,
          fix: 'check the path passed to --config; relative paths resolve from the current directory.',
        },
      ],
    };
  }

  // Caches off: rndl must re-read edited configs on every run and must never
  // write jiti's cache directory into the user's node_modules. interopDefault
  // off too — its Proxy makes `mod.default` fall back to the namespace itself,
  // which would defeat the "is there a real default export?" check below.
  const jiti = createJiti(pathToFileURL(absolutePath).href, {
    interopDefault: false,
    moduleCache: false,
    fsCache: false,
  });

  let mod: Record<string, unknown>;
  try {
    mod = await jiti.import<Record<string, unknown>>(absolutePath);
  } catch (error) {
    return {
      value: undefined,
      sourceFile,
      diagnostics: [
        {
          severity: 'error',
          code: 'CONFIG_LOAD_FAILED',
          message: `importing ${sourceFile} threw: ${error instanceof Error ? error.message : String(error)}`,
          fix: ISOLATED_MODULE_GUIDANCE,
        },
      ],
    };
  }

  const availableExports = Object.keys(mod).filter((key) => key !== '__esModule');
  const chosen = exportName ?? (mod['default'] !== undefined ? 'default' : 'linking');
  const value = mod[chosen];

  if (value === undefined) {
    return {
      value: undefined,
      sourceFile,
      diagnostics: [
        {
          severity: 'error',
          code: 'CONFIG_EXPORT_NOT_FOUND',
          message:
            exportName !== undefined
              ? `${sourceFile} has no export named '${exportName}'. Available exports: ${availableExports.length > 0 ? availableExports.join(', ') : '(none)'}.`
              : `${sourceFile} has neither a default export nor a 'linking' export. Available exports: ${availableExports.length > 0 ? availableExports.join(', ') : '(none)'}.`,
          fix: 'name the export explicitly: --config <module>#<exportName>.',
        },
      ],
    };
  }

  return { value, sourceFile, diagnostics: [] };
}
