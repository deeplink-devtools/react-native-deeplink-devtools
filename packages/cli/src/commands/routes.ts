import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { buildRouteTable } from '@deeplink-devtools/adapter-expo-router';
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

/**
 * Execute the routes scan and format the result. Pure function of its inputs
 * (no process access), so tests can drive it directly.
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
  const hasErrors = result.diagnostics.some((d) => d.severity === 'error');
  const stderr = renderDiagnostics(result.diagnostics, options.color);

  if (options.json) {
    return { stdout: JSON.stringify(result, null, 2), stderr, exitCode: hasErrors ? 1 : 0 };
  }
  return {
    stdout: hasErrors ? '' : renderRoutesTable(result, options.color),
    stderr,
    exitCode: hasErrors ? 1 : 0,
  };
}

/**
 * `rndl routes [--json] [--app-dir <dir>]` — print the app's deep-link route
 * table, extracted from the Expo Router file system conventions.
 */
export function routesCommand(): Command {
  return new Command('routes')
    .description('List the deep-link routes of an Expo Router app')
    .option('--json', 'print the full scan result as JSON', false)
    .option('--app-dir <dir>', 'path to the Expo Router app directory (default: app/ or src/app/)')
    .action((options: { json: boolean; appDir?: string }) => {
      const appDir = resolveAppDir(process.cwd(), options.appDir);
      const output = runRoutes(appDir, { json: options.json, color: shouldColor() });
      if (output.stdout.length > 0) {
        console.log(output.stdout);
      }
      if (output.stderr.length > 0) {
        console.error(output.stderr);
      }
      process.exitCode = output.exitCode;
    });
}
