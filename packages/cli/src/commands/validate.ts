import { Command, Option } from 'commander';
import type { FetchedDocument, RouteTable, ValidationResult } from '@deeplink-devtools/core';
import { toSarif, validateAasa, validateAssetlinks } from '@deeplink-devtools/core';
import { buildRouteTable } from '@deeplink-devtools/adapter-expo-router';
import { scanLinkingModule } from '@deeplink-devtools/adapter-react-navigation';
import { readAppConfig } from '../app-config.js';
import { fetchAasa, fetchAssetlinks, normalizeDomain } from '../fetch.js';
import { renderDiagnostics, renderNotes, shouldColor, summarizeDiagnostics } from '../render.js';
import { resolveAppDir } from './routes.js';

/** What `rndl validate` writes and how it exits - pure data, for testability. */
export interface ValidateOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Inputs to a validate run, after the CLI has resolved the route table and package. */
export interface ValidateOptions {
  json: boolean;
  sarif: boolean;
  color: boolean;
  toolVersion: string;
  packageName?: string;
  sha256?: string;
  table?: RouteTable;
}

/**
 * Validate two already-fetched documents and format the output. Pure function
 * of its inputs (no network, no process), so tests can drive it directly with
 * crafted {@link FetchedDocument}s. Exit code is 1 when any error-severity
 * diagnostic is present.
 */
export function buildValidateOutput(
  domain: string,
  aasaDoc: FetchedDocument,
  assetlinksDoc: FetchedDocument,
  options: ValidateOptions,
): ValidateOutput {
  const aasa = validateAasa(aasaDoc, options.table !== undefined ? { table: options.table } : {});
  const assetlinks = validateAssetlinks(assetlinksDoc, {
    ...(options.packageName !== undefined ? { packageName: options.packageName } : {}),
    ...(options.sha256 !== undefined ? { sha256: options.sha256 } : {}),
  });

  const result: ValidationResult = {
    domain,
    aasa,
    assetlinks,
    diagnostics: [...aasa.diagnostics, ...assetlinks.diagnostics],
    notes: [...aasa.notes, ...assetlinks.notes],
  };

  const exitCode = result.diagnostics.some((d) => d.severity === 'error') ? 1 : 0;

  if (options.sarif) {
    return {
      stdout: JSON.stringify(toSarif(result, { toolVersion: options.toolVersion }), null, 2),
      stderr: '',
      exitCode,
    };
  }
  if (options.json) {
    return { stdout: JSON.stringify(result, null, 2), stderr: '', exitCode };
  }
  return { stdout: renderReport(result, options.color), stderr: '', exitCode };
}

/**
 * Fetch and validate a domain's AASA and assetlinks.json. Delegates the pure
 * work to {@link buildValidateOutput}; only the two network fetches are impure.
 */
export async function runValidate(
  domain: string,
  options: ValidateOptions,
): Promise<ValidateOutput> {
  const host = normalizeDomain(domain);
  const [aasaDoc, assetlinksDoc] = await Promise.all([fetchAasa(host), fetchAssetlinks(host)]);
  return buildValidateOutput(host, aasaDoc, assetlinksDoc, options);
}

/** Render the human-readable report: per-file diagnostics, notes, and a summary. */
function renderReport(result: ValidationResult, color: boolean): string {
  const blocks: string[] = [];
  blocks.push(`Validating ${result.domain}`);

  blocks.push(`\napple-app-site-association - ${summarizeDiagnostics(result.aasa.diagnostics)}`);
  if (result.aasa.diagnostics.length > 0) {
    blocks.push(renderDiagnostics(result.aasa.diagnostics, color));
  }

  blocks.push(`\nassetlinks.json - ${summarizeDiagnostics(result.assetlinks.diagnostics)}`);
  if (result.assetlinks.diagnostics.length > 0) {
    blocks.push(renderDiagnostics(result.assetlinks.diagnostics, color));
  }

  if (result.notes.length > 0) {
    blocks.push('');
    blocks.push(renderNotes(result.notes, color));
  }

  return blocks.join('\n');
}

/** Resolve a route table for the cross-check from the CLI flags (or auto-detection). */
async function resolveTable(
  cwd: string,
  options: { appDir?: string; config?: string; dotenv?: string; crossCheck: boolean },
): Promise<RouteTable | undefined> {
  if (!options.crossCheck) {
    return undefined;
  }
  if (options.config !== undefined) {
    const result = await scanLinkingModule(options.config, {
      cwd,
      ...(options.dotenv !== undefined ? { dotenvPath: options.dotenv } : {}),
    });
    return result.table;
  }
  const appDir = resolveAppDir(cwd, options.appDir);
  if (appDir === undefined) {
    return undefined;
  }
  return buildRouteTable(appDir).table;
}

/**
 * `rndl validate --domain <domain> [--json | --sarif] [--package <name>]
 * [--sha256 <fp>] [--app-dir <dir> | --config <module>] [--dotenv [path]]
 * [--no-cross-check]` - validate a domain's Apple App Site Association and
 * Android assetlinks.json.
 */
export function validateCommand(toolVersion: string): Command {
  return new Command('validate')
    .description("Validate a domain's universal-link (AASA) and App Links (assetlinks) files")
    .requiredOption('--domain <domain>', 'domain to validate, e.g. example.com')
    .addOption(new Option('--json', 'print the full result as JSON').conflicts('sarif'))
    .addOption(new Option('--sarif', 'print a SARIF 2.1.0 report').conflicts('json'))
    .option('--package <name>', 'expected Android package name (else read from app.json)')
    .option('--sha256 <fingerprint>', 'expected SHA-256 signing-cert fingerprint to look for')
    .addOption(
      new Option(
        '--app-dir <dir>',
        'Expo Router app directory for the route cross-check',
      ).conflicts('config'),
    )
    .addOption(
      new Option(
        '--config <module[#export]>',
        'React Navigation linking module for the route cross-check',
      ).conflicts('appDir'),
    )
    .addOption(
      new Option(
        '--dotenv [path]',
        "dotenv file backing '@env' imports in the --config module (bare flag: .env)",
      ).preset('.env'),
    )
    .option('--no-cross-check', 'skip matching the route table against AASA components')
    .action(
      async (options: {
        domain: string;
        json?: boolean;
        sarif?: boolean;
        package?: string;
        sha256?: string;
        appDir?: string;
        config?: string;
        dotenv?: string;
        crossCheck: boolean;
      }) => {
        const cwd = process.cwd();
        const table = await resolveTable(cwd, {
          ...(options.appDir !== undefined ? { appDir: options.appDir } : {}),
          ...(options.config !== undefined ? { config: options.config } : {}),
          ...(options.dotenv !== undefined ? { dotenv: options.dotenv } : {}),
          crossCheck: options.crossCheck,
        });
        const packageName = options.package ?? readAppConfig(cwd).androidPackage;

        const output = await runValidate(options.domain, {
          json: options.json ?? false,
          sarif: options.sarif ?? false,
          color: shouldColor(),
          toolVersion,
          ...(packageName !== undefined ? { packageName } : {}),
          ...(options.sha256 !== undefined ? { sha256: options.sha256 } : {}),
          ...(table !== undefined ? { table } : {}),
        });

        if (output.stdout.length > 0) {
          console.log(output.stdout);
        }
        if (output.stderr.length > 0) {
          console.error(output.stderr);
        }
        process.exitCode = output.exitCode;
      },
    );
}
