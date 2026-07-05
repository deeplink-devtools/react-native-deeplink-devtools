import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command, Option } from 'commander';
import type { Diagnostic, RouteTable } from '@deeplink-devtools/core';
import { buildRouteTable } from '@deeplink-devtools/adapter-expo-router';
import { scanLinkingModule } from '@deeplink-devtools/adapter-react-navigation';
import { renderDiagnostics, renderRoutesTable, shouldColor } from '../render.js';

/**
 * Locate the Expo Router app directory: an explicit `--app-dir` wins;
 * otherwise `app/` then `src/app/` under `cwd` (the SDK 57 template default).
 * Returns `undefined` when nothing plausible exists.
 */
export function resolveAppDir(cwd: string, appDirFlag?: string): string | undefined {
  if (appDirFlag !== undefined) {
    return resolve(cwd, appDirFlag);
  }
  for (const candidate of ['app', 'src/app']) {
    const absolute = resolve(cwd, candidate);
    if (existsSync(absolute)) {
      return absolute;
    }
  }
  return undefined;
}

/** What `rndl routes` writes and how it exits — pure data, for testability. */
export interface RoutesOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Shared tail of both scan paths: diagnostics to stderr, table or JSON to stdout. */
function toOutput(
  result: { table: RouteTable; diagnostics: Diagnostic[] },
  summaryExtras: string[],
  options: { json: boolean; color: boolean },
): RoutesOutput {
  const hasErrors = result.diagnostics.some((d) => d.severity === 'error');
  const stderr = renderDiagnostics(result.diagnostics, options.color);

  if (options.json) {
    return { stdout: JSON.stringify(result, null, 2), stderr, exitCode: hasErrors ? 1 : 0 };
  }
  return {
    stdout: hasErrors ? '' : renderRoutesTable(result.table, summaryExtras, options.color),
    stderr,
    exitCode: hasErrors ? 1 : 0,
  };
}

/**
 * Execute the Expo Router scan and format the result. Pure function of its
 * inputs (no process access), so tests can drive it directly.
 */
export function runRoutes(
  appDir: string | undefined,
  options: { json: boolean; color: boolean },
): RoutesOutput {
  if (appDir === undefined) {
    return {
      stdout: '',
      stderr:
        'error APP_DIR_NOT_FOUND: no Expo Router app directory found (looked for app/ and src/app/).\n' +
        '  fix: run from your project root, or pass --app-dir <path>.',
      exitCode: 1,
    };
  }

  const result = buildRouteTable(appDir);
  const summaryExtras: string[] = [];
  if (result.apiRoutes.length > 0) {
    summaryExtras.push(
      `${result.apiRoutes.length} API route${result.apiRoutes.length === 1 ? '' : 's'}`,
    );
  }
  if (result.layouts.length > 0) {
    summaryExtras.push(`${result.layouts.length} layout${result.layouts.length === 1 ? '' : 's'}`);
  }
  return toOutput(result, summaryExtras, options);
}

/**
 * Load a React Navigation linking module (`<module>[#<export>]`, resolved
 * from `cwd`) and format its route table. Pure aside from the module import
 * itself, so tests can drive it directly.
 */
export async function runRoutesConfig(
  specifier: string,
  cwd: string,
  options: { json: boolean; color: boolean },
): Promise<RoutesOutput> {
  const result = await scanLinkingModule(specifier, { cwd });
  const summaryExtras: string[] = [];
  if (result.prefixes.length > 0) {
    summaryExtras.push(
      `${result.prefixes.length} prefix${result.prefixes.length === 1 ? '' : 'es'}`,
    );
  }
  if (result.pathlessScreens.length > 0) {
    summaryExtras.push(
      `${result.pathlessScreens.length} pathless screen${result.pathlessScreens.length === 1 ? '' : 's'}`,
    );
  }
  return toOutput(result, summaryExtras, options);
}

/**
 * `rndl routes [--json] [--app-dir <dir> | --config <module[#export]>]` —
 * print the app's deep-link route table, extracted from Expo Router file
 * conventions or from a React Navigation linking configuration.
 */
export function routesCommand(): Command {
  return new Command('routes')
    .description('List the deep-link routes of an Expo Router or React Navigation app')
    .option('--json', 'print the full scan result as JSON', false)
    .addOption(
      new Option(
        '--app-dir <dir>',
        'path to the Expo Router app directory (default: app/ or src/app/)',
      ).conflicts('config'),
    )
    .addOption(
      new Option(
        '--config <module[#export]>',
        'React Navigation linking module, e.g. src/navigation/linking.ts#linking',
      ).conflicts('appDir'),
    )
    .action(async (options: { json: boolean; appDir?: string; config?: string }) => {
      const output =
        options.config !== undefined
          ? await runRoutesConfig(options.config, process.cwd(), {
              json: options.json,
              color: shouldColor(),
            })
          : runRoutes(resolveAppDir(process.cwd(), options.appDir), {
              json: options.json,
              color: shouldColor(),
            });
      if (output.stdout.length > 0) {
        console.log(output.stdout);
      }
      if (output.stderr.length > 0) {
        console.error(output.stderr);
      }
      process.exitCode = output.exitCode;
    });
}
