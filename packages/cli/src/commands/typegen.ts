import { mkdirSync, watch, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Command, Option } from 'commander';
import type { Diagnostic } from '@deeplink-devtools/core';
import { generateDeepLinkTypes } from '@deeplink-devtools/typegen';
import { findDynamicConfig } from '../app-config.js';
import { renderDiagnostics, renderNotes, shouldColor } from '../render.js';
import { loadTable, resolvePrefix } from './open.js';
import { resolveAppDir } from './routes.js';

/** Options that select and shape the scan (everything but I/O). */
export interface TypegenOptions {
  appDir?: string;
  config?: string;
  /** dotenv file backing '@env' imports in the --config module. */
  dotenv?: string;
  scheme?: string;
}

/** The generated module plus what to report; `content` is absent on a scan error. */
export interface TypegenResult {
  content?: string;
  diagnostics: Diagnostic[];
  notes: string[];
  routeCount: number;
  prefix: string;
  exitCode: number;
}

/**
 * Load the route table (Expo Router or React Navigation, exactly as `rndl open`
 * does), resolve the scheme, and generate the typed deep-link module. Pure
 * aside from reading the app source; does the I/O-free work so tests can drive
 * it directly.
 */
export async function buildTypegen(cwd: string, options: TypegenOptions): Promise<TypegenResult> {
  const resolution = await loadTable(cwd, {
    appDir: options.appDir,
    config: options.config,
    dotenv: options.dotenv,
  });
  if (!resolution.ok) {
    return {
      diagnostics: resolution.diagnostics,
      notes: [],
      routeCount: 0,
      prefix: '',
      exitCode: 1,
    };
  }
  const notes: string[] = [];
  const searchDir = resolution.appDir ?? cwd;
  const prefix =
    resolvePrefix({ scheme: options.scheme }, resolution.prefixes, searchDir, notes) ?? '';
  if (prefix === '') {
    const dynamicConfig = findDynamicConfig(searchDir);
    notes.push(
      dynamicConfig !== undefined
        ? `no scheme found: rndl reads a static app.json but found ${dynamicConfig}, a dynamic Expo config it does not evaluate. buildDeepLink returns path-only URLs; pass --scheme to set one.`
        : 'no scheme found (app.json or config prefixes); buildDeepLink returns path-only URLs. Pass --scheme to set one.',
    );
  }
  const content = generateDeepLinkTypes(resolution.table, { defaultPrefix: prefix });
  return {
    content,
    diagnostics: [],
    notes,
    routeCount: resolution.table.routes.length,
    prefix,
    exitCode: 0,
  };
}

/**
 * `rndl typegen --out <file> [--app-dir <dir> | --config <module[#export]>]
 * [--dotenv [path]] [--scheme <scheme>] [--watch]` - generate TypeScript
 * deep-link types (`buildDeepLink` + `useTypedParams`) from the app's route
 * table.
 */
export function typegenCommand(): Command {
  return new Command('typegen')
    .description(
      'Generate TypeScript deep-link types (buildDeepLink + useTypedParams) from your route table',
    )
    .requiredOption('--out <file>', 'path to write the generated types module to')
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
    .addOption(
      new Option(
        '--dotenv [path]',
        "dotenv file backing '@env' imports in the --config module (bare flag: .env)",
      ).preset('.env'),
    )
    .option(
      '--scheme <scheme>',
      'scheme/prefix to bake into buildDeepLink (default: app.json scheme or config prefixes)',
    )
    .option('--watch', 're-generate when the app source changes', false)
    .action(async (options: TypegenOptions & { out: string; watch?: boolean }) => {
      const cwd = process.cwd();
      const outPath = resolve(cwd, options.out);
      const color = shouldColor();

      const runOnce = async (): Promise<number> => {
        const result = await buildTypegen(cwd, options);
        if (result.content !== undefined) {
          mkdirSync(dirname(outPath), { recursive: true });
          writeFileSync(outPath, result.content, 'utf8');
          const routeWord = result.routeCount === 1 ? 'route' : 'routes';
          console.log(
            `rndl typegen: wrote types for ${result.routeCount} ${routeWord} to ${options.out}`,
          );
        }
        if (result.notes.length > 0) {
          console.error(renderNotes(result.notes, color));
        }
        if (result.diagnostics.length > 0) {
          console.error(renderDiagnostics(result.diagnostics, color));
        }
        return result.exitCode;
      };

      const exitCode = await runOnce();
      if (options.watch !== true) {
        process.exitCode = exitCode;
        return;
      }

      const modulePath = options.config?.split('#')[0];
      const target =
        options.config !== undefined
          ? resolve(cwd, modulePath ?? options.config)
          : resolveAppDir(cwd, options.appDir);
      if (target === undefined) {
        process.exitCode = exitCode;
        return;
      }
      console.log(
        `rndl typegen: watching ${options.config ?? options.appDir ?? target} for changes (ctrl+c to stop)`,
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      watch(target, { recursive: true }, () => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        timer = setTimeout(() => {
          void runOnce();
        }, 150);
      });
    });
}
