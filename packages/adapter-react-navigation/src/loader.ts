import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';
import type { Diagnostic } from '@deeplink-devtools/core';
import { parseDotenv, renderEnvModuleSource } from './dotenv.js';

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

/** Options for {@link loadLinkingModule} (and `scanLinkingModule`). */
export interface LoadLinkingModuleOptions {
  /** Base directory for resolving the module path (default: `process.cwd()`). */
  cwd?: string;
  /**
   * Path to a dotenv file (resolved against `cwd`) whose values back the
   * `@env` module (react-native-dotenv) while the linking module loads.
   * Without it, a linking module that imports from `@env` fails to load,
   * because `@env` only exists in the Metro/babel build.
   */
  dotenvPath?: string;
}

/** What {@link loadLinkingModule} produced. */
export interface LoadedLinkingModule {
  /** The selected export; `undefined` when loading failed (see diagnostics). */
  value: unknown;
  /** Load-time findings: `CONFIG_LOAD_FAILED`, `CONFIG_EXPORT_NOT_FOUND`, or `DOTENV_NOT_FOUND`. */
  diagnostics: Diagnostic[];
  /** The module path relative to `cwd` (forward slashes), for `Route.sourceFile`. */
  sourceFile: string;
}

const ISOLATED_MODULE_GUIDANCE =
  'your linking module likely runs app code at import time (e.g. it imports react-native or a component). ' +
  'Move the linking config into an isolated module that only exports plain data and parse/stringify ' +
  'functions (react-navigation imports are fine as `import type`), then point --config at that file.';

const MISSING_ENV_MODULE_GUIDANCE =
  "your linking module imports from '@env' (react-native-dotenv), a virtual module that only exists " +
  'in the Metro/babel build. Pass --dotenv [path] so rndl backs @env with the values from your dotenv ' +
  'file (bare --dotenv reads .env in the current directory).';

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
  options: LoadLinkingModuleOptions = {},
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

  // With --dotenv, the parsed values are written to a throwaway module and
  // jiti's alias points '@env' at it (an exact-specifier match resolved to an
  // absolute file path, before jiti's own require runs).
  let envDir: string | undefined;
  let envModulePath: string | undefined;
  if (options.dotenvPath !== undefined) {
    const dotenvAbsolute = resolve(cwd, options.dotenvPath);
    if (!existsSync(dotenvAbsolute)) {
      return {
        value: undefined,
        sourceFile,
        diagnostics: [
          {
            severity: 'error',
            code: 'DOTENV_NOT_FOUND',
            message: `dotenv file not found: ${dotenvAbsolute}`,
            fix: 'check the path passed to --dotenv; relative paths resolve from the current directory. Bare --dotenv reads .env.',
          },
        ],
      };
    }
    const envValues = parseDotenv(readFileSync(dotenvAbsolute, 'utf8'));
    envDir = mkdtempSync(join(tmpdir(), 'rndl-env-'));
    envModulePath = join(envDir, 'env.mjs');
    writeFileSync(envModulePath, renderEnvModuleSource(envValues), 'utf8');
  }

  try {
    // Caches off: rndl must re-read edited configs on every run and must never
    // write jiti's cache directory into the user's node_modules. interopDefault
    // off too - its Proxy makes `mod.default` fall back to the namespace itself,
    // which would defeat the "is there a real default export?" check below.
    const jiti = createJiti(pathToFileURL(absolutePath).href, {
      interopDefault: false,
      moduleCache: false,
      fsCache: false,
      ...(envModulePath !== undefined ? { alias: { '@env': envModulePath } } : {}),
    });

    let mod: Record<string, unknown>;
    try {
      mod = await jiti.import<Record<string, unknown>>(absolutePath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        value: undefined,
        sourceFile,
        diagnostics: [
          {
            severity: 'error',
            code: 'CONFIG_LOAD_FAILED',
            message: `importing ${sourceFile} threw: ${detail}`,
            fix: detail.includes("Cannot find module '@env'")
              ? MISSING_ENV_MODULE_GUIDANCE
              : ISOLATED_MODULE_GUIDANCE,
          },
        ],
      };
    }

    return pickExport(mod, exportName, sourceFile);
  } finally {
    if (envDir !== undefined) {
      try {
        rmSync(envDir, { recursive: true, force: true });
      } catch {
        // Best effort: a leftover temp dir is harmless.
      }
    }
  }
}

/** Select the requested export from the loaded module (see {@link loadLinkingModule}). */
function pickExport(
  mod: Record<string, unknown>,
  exportName: string | undefined,
  sourceFile: string,
): LoadedLinkingModule {
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
