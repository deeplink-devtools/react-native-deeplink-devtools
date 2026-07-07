import { Command, Option } from 'commander';
import type { Diagnostic, Route, RouteTable } from '@deeplink-devtools/core';
import { buildRouteUrl, normalizePrefix } from '@deeplink-devtools/core';
import { buildRouteTable } from '@deeplink-devtools/adapter-expo-router';
import { scanLinkingModule } from '@deeplink-devtools/adapter-react-navigation';
import { findAppConfig } from '../app-config.js';
import type { ExecFn } from '../exec.js';
import { systemExec } from '../exec.js';
import {
  listAndroidDevices,
  listIosSimulators,
  pickAndroidDevice,
  pickIosSimulator,
} from '../devices.js';
import { renderDiagnostics, renderNotes, shouldColor } from '../render.js';
import { resolveAppDir } from './routes.js';

/** What `rndl open` writes and how it exits — pure data, for testability. */
export interface OpenOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Inputs to an open run, after the CLI has parsed flags. */
export interface OpenOptions {
  /** `undefined` = auto (open wherever a device exists); otherwise the requested platform(s). */
  platform?: 'ios' | 'android' | 'both';
  device?: string;
  params: Record<string, string>;
  scheme?: string;
  appDir?: string;
  config?: string;
  packageName?: string;
  color: boolean;
}

/** Outcome of attempting one platform. */
export type PlatformOutcome =
  | { kind: 'opened'; line: string; note?: string }
  | { kind: 'skipped'; note: string }
  | { kind: 'failed'; diagnostic: Diagnostic };

function errorOutput(diagnostics: Diagnostic[], color: boolean): OpenOutput {
  return { stdout: '', stderr: renderDiagnostics(diagnostics, color), exitCode: 1 };
}

/**
 * Resolve the target and options into a concrete URL, then open it on the
 * selected device(s). Pure of process state; the `exec` seam is injected so
 * this is fully unit-testable without a real toolchain.
 */
export async function runOpen(
  target: string,
  cwd: string,
  options: OpenOptions,
  exec: ExecFn,
): Promise<OpenOutput> {
  const strict = options.platform !== undefined;
  const platforms: ('ios' | 'android')[] =
    options.platform === 'ios'
      ? ['ios']
      : options.platform === 'android'
        ? ['android']
        : ['ios', 'android'];

  // A device id is platform-specific; it only makes sense with one explicit platform.
  if (options.device !== undefined && platforms.length > 1) {
    return errorOutput(
      [
        {
          severity: 'error',
          code: 'DEVICE_FLAG_NEEDS_PLATFORM',
          message: '--device requires an explicit --platform ios or --platform android',
          fix: 'add --platform ios (or android), or drop --device.',
        },
      ],
      options.color,
    );
  }

  const resolved = await resolveUrl(target, cwd, options);
  if (!resolved.ok) {
    return errorOutput(resolved.diagnostics, options.color);
  }
  const { url } = resolved;
  const preNotes = resolved.notes;

  const outcomes: PlatformOutcome[] = [];
  for (const platform of platforms) {
    outcomes.push(
      platform === 'ios'
        ? await openIos(exec, url, options.device, strict)
        : await openAndroid(exec, url, options.device, options.packageName, strict),
    );
  }

  const errors = outcomes.filter(
    (o): o is Extract<PlatformOutcome, { kind: 'failed' }> => o.kind === 'failed',
  );
  const opened = outcomes.filter(
    (o): o is Extract<PlatformOutcome, { kind: 'opened' }> => o.kind === 'opened',
  );
  const skipNotes = outcomes.flatMap((o) => (o.kind === 'skipped' ? [o.note] : []));

  const diagnostics = errors.map((o) => o.diagnostic);
  // Auto mode: nothing opened and nothing failed means no device anywhere — one clear error.
  if (!strict && opened.length === 0 && errors.length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'NO_DEVICES',
      message: 'no iOS simulator or Android device is available to open the link',
      fix: 'boot a simulator / start an emulator / connect a device, or pass --platform to target one.',
    });
  }

  const stdoutLines: string[] = [
    ...opened.map((o) => o.line),
    ...opened.flatMap((o) => (o.note !== undefined ? [o.note] : [])),
  ];
  const noteBlock = renderNotes([...preNotes, ...skipNotes], options.color);
  const stdout = [stdoutLines.join('\n'), noteBlock].filter((s) => s.length > 0).join('\n');
  const stderr = renderDiagnostics(diagnostics, options.color);
  const exitCode = diagnostics.length > 0 ? 1 : 0;

  return { stdout, stderr, exitCode };
}

/** URL resolution result: either a concrete URL (+ notes) or blocking diagnostics. */
type UrlResolution =
  { ok: true; url: string; notes: string[] } | { ok: false; diagnostics: Diagnostic[] };

/** Turn the target (a full URL or a route name/pattern) into a concrete URL. */
async function resolveUrl(
  target: string,
  cwd: string,
  options: OpenOptions,
): Promise<UrlResolution> {
  if (target.includes('://')) {
    return { ok: true, url: target, notes: [] };
  }

  const table = await loadTable(cwd, options);
  if (!table.ok) {
    return { ok: false, diagnostics: table.diagnostics };
  }

  const matches = table.table.routes.filter(
    (route) => route.name === target || route.pattern === normalizePattern(target),
  );
  if (matches.length === 0) {
    return { ok: false, diagnostics: [routeNotFound(target, table.table)] };
  }
  const route = matches[0] as Route;
  const notes: string[] = [];
  if (matches.length > 1) {
    notes.push(`${matches.length} routes match '${target}'; using the first (${route.pattern}).`);
  }

  const prefix = resolvePrefix(options, table.prefixes, table.appDir ?? cwd, notes);
  if (prefix === undefined) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'SCHEME_NOT_FOUND',
          message: `cannot determine a URL scheme for route ${route.pattern}`,
          fix: 'pass --scheme <scheme> (e.g. myapp or https://example.com), or add "scheme" to app.json.',
        },
      ],
    };
  }

  const built = buildRouteUrl(route, options.params, prefix);
  if (built.url === undefined) {
    const named = built.missing.filter((m) => m !== '*');
    const detail = built.missing.includes('*')
      ? 'the pattern has an unnamed wildcard segment — pass a full URL instead'
      : `missing required param${named.length === 1 ? '' : 's'}: ${named.join(', ')}`;
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'OPEN_MISSING_PARAMS',
          message: `cannot build a URL for ${route.pattern}: ${detail}`,
          route,
          fix:
            named.length > 0
              ? `provide it: --params ${named.map((n) => `${n}=<value>`).join(' ')}`
              : 'pass the full URL instead of a route name.',
        },
      ],
    };
  }
  notes.push(...built.warnings);
  if (built.extras.length > 0) {
    notes.push(`extra params added to the query string: ${built.extras.join(', ')}`);
  }
  return { ok: true, url: built.url, notes };
}

/** A route table loaded for open, or the diagnostics explaining why it could not be. */
export type TableResolution =
  | { ok: true; table: RouteTable; prefixes: string[]; appDir?: string }
  | { ok: false; diagnostics: Diagnostic[] };

/** Load the route table exactly as `rndl open` does (`--config`, `--app-dir`, or auto-detect). */
export async function loadTable(
  cwd: string,
  options: Pick<OpenOptions, 'config' | 'appDir'>,
): Promise<TableResolution> {
  if (options.config !== undefined) {
    const result = await scanLinkingModule(options.config, { cwd });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    if (errors.length > 0) {
      return { ok: false, diagnostics: errors };
    }
    return { ok: true, table: result.table, prefixes: result.prefixes };
  }
  const appDir = resolveAppDir(cwd, options.appDir);
  if (appDir === undefined) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'APP_DIR_NOT_FOUND',
          message: 'no Expo Router app directory found (looked for app/ and src/app/)',
          fix: 'run from your project root, pass --app-dir <path>, or use --config for React Navigation.',
        },
      ],
    };
  }
  const result = buildRouteTable(appDir);
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    return { ok: false, diagnostics: errors };
  }
  return { ok: true, table: result.table, prefixes: [], appDir };
}

/**
 * Resolve the scheme/prefix: `--scheme` wins, then React Navigation prefixes,
 * then the nearest app.json scheme (searched upward from the app directory).
 */
export function resolvePrefix(
  options: Pick<OpenOptions, 'scheme'>,
  prefixes: string[],
  searchDir: string,
  notes: string[],
): string | undefined {
  if (options.scheme !== undefined) {
    return normalizePrefix(options.scheme);
  }
  if (prefixes.length > 0) {
    if (prefixes.length > 1) {
      notes.push(
        `config declares ${prefixes.length} prefixes; using ${prefixes[0]} — pass --scheme to choose.`,
      );
    }
    return normalizePrefix(prefixes[0] as string);
  }
  const scheme = findAppConfig(searchDir).scheme;
  return scheme !== undefined ? normalizePrefix(scheme) : undefined;
}

/** Normalize a route-name target so `users/x` also matches the `/users/x` pattern. */
function normalizePattern(target: string): string {
  return target.startsWith('/') ? target : `/${target}`;
}

function routeNotFound(target: string, table: RouteTable): Diagnostic {
  const needle = target.toLowerCase();
  const suggestions = table.routes
    .filter(
      (route) =>
        route.name.toLowerCase().includes(needle) || route.pattern.toLowerCase().includes(needle),
    )
    .slice(0, 3)
    .map((route) => route.pattern);
  const fix =
    suggestions.length > 0
      ? `did you mean: ${suggestions.join(', ')}? Run \`rndl routes\` to see all.`
      : 'run `rndl routes` to see available routes, or pass a full URL.';
  return {
    severity: 'error',
    code: 'ROUTE_NOT_FOUND',
    message: `no route matches '${target}'`,
    fix,
  };
}

/** Open a URL on an iOS simulator via simctl. */
export async function openIos(
  exec: ExecFn,
  url: string,
  device: string | undefined,
  strict: boolean,
): Promise<PlatformOutcome> {
  const listing = await listIosSimulators(exec);
  if (!listing.ok) {
    return degrade(listing.diagnostic, strict, 'iOS');
  }
  const selection = pickIosSimulator(listing.devices, device);
  if (!selection.ok) {
    return degrade(selection.diagnostic, strict, 'iOS');
  }
  const sim = selection.device;
  const result = await exec('xcrun', ['simctl', 'openurl', sim.udid, url]);
  if (result.exitCode !== 0) {
    // Verified live (Xcode 26 sim): no installed app for the scheme surfaces as
    // LSApplicationWorkspaceErrorDomain code=115 (older Xcodes used OSStatus -10814).
    const noApp = /LSApplicationWorkspaceErrorDomain|code=115|-10814/.test(result.stderr);
    return {
      kind: 'failed',
      diagnostic: {
        severity: 'error',
        code: 'IOS_OPEN_FAILED',
        message: `simctl openurl failed on ${sim.name}: ${result.stderr.trim() || `exit ${result.exitCode}`}`,
        fix: noApp
          ? `no app on this simulator handles this URL — install the app (e.g. npx expo run:ios) or open an https:// URL.`
          : 'check the URL and that the simulator is responsive.',
      },
    };
  }
  return {
    kind: 'opened',
    line: `opened ${url} on ${sim.name} (${sim.udid})`,
    ...(selection.note !== undefined ? { note: selection.note } : {}),
  };
}

/** Open a URL on an Android device via `adb shell am start`. */
export async function openAndroid(
  exec: ExecFn,
  url: string,
  device: string | undefined,
  packageName: string | undefined,
  strict: boolean,
): Promise<PlatformOutcome> {
  const listing = await listAndroidDevices(exec);
  if (!listing.ok) {
    return degrade(listing.diagnostic, strict, 'Android');
  }
  const selection = pickAndroidDevice(listing.devices, device);
  if (!selection.ok) {
    return degrade(selection.diagnostic, strict, 'Android');
  }
  const serial = selection.device.serial;
  const args = [
    '-s',
    serial,
    'shell',
    'am',
    'start',
    '-W',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    quoteForDeviceShell(url),
    ...(packageName !== undefined ? [packageName] : []),
  ];
  const result = await exec('adb', args);
  // `am start` frequently exits 0 while printing `Error:` to stdout.
  const failed = result.exitCode !== 0 || /^Error:/m.test(result.stdout);
  if (failed) {
    const line = /^Error:.*$/m.exec(result.stdout)?.[0] ?? result.stderr.trim() ?? '';
    return {
      kind: 'failed',
      diagnostic: {
        severity: 'error',
        code: 'ANDROID_OPEN_FAILED',
        message: `am start failed on ${serial}: ${line || `exit ${result.exitCode}`}`,
        fix: 'confirm the app is installed and declares an intent-filter for this URL (or pass --package).',
      },
    };
  }
  return {
    kind: 'opened',
    line: `opened ${url} on ${serial}`,
    ...(selection.note !== undefined ? { note: selection.note } : {}),
  };
}

/** In strict mode a device/toolchain problem is an error; in auto mode it is a skip note. */
function degrade(diagnostic: Diagnostic, strict: boolean, label: string): PlatformOutcome {
  if (strict) {
    return { kind: 'failed', diagnostic };
  }
  return { kind: 'skipped', note: `${label}: skipped — ${diagnostic.message}` };
}

/** Quote a value for the on-device `sh -c` that `adb shell` invokes (the `'\''` dance). */
function quoteForDeviceShell(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * `rndl open <url | route> [--params k=v] [--platform ios|android|both]
 * [--device <id>] [--scheme <s>] [--app-dir <dir> | --config <module>]
 * [--package <name>]` — open a deep link on a simulator/device.
 */
export function openCommand(): Command {
  return new Command('open')
    .description('Open a deep link (URL or route) on an iOS simulator or Android device')
    .argument('<target>', 'a full URL (contains ://) or a route name/pattern from `rndl routes`')
    .option('--params <k=v...>', 'route parameter values, e.g. --params id=42 tab=home')
    .addOption(
      new Option('--platform <platform>', 'target platform').choices(['ios', 'android', 'both']),
    )
    .option('--device <id>', 'simulator UDID/name or adb serial (needs an explicit --platform)')
    .option('--scheme <scheme>', 'URL scheme or prefix for route mode (e.g. myapp, https://host)')
    .addOption(
      new Option('--app-dir <dir>', 'Expo Router app directory for route lookup').conflicts(
        'config',
      ),
    )
    .addOption(
      new Option(
        '--config <module[#export]>',
        'React Navigation linking module for route lookup',
      ).conflicts('appDir'),
    )
    .option('--package <name>', 'Android package to receive the intent')
    .action(
      async (
        target: string,
        options: {
          params?: string[];
          platform?: 'ios' | 'android' | 'both';
          device?: string;
          scheme?: string;
          appDir?: string;
          config?: string;
          package?: string;
        },
      ) => {
        const params = parseParams(options.params ?? []);
        if (!params.ok) {
          console.error(renderDiagnostics([params.diagnostic], shouldColor()));
          process.exitCode = 1;
          return;
        }
        const output = await runOpen(
          target,
          process.cwd(),
          {
            ...(options.platform !== undefined ? { platform: options.platform } : {}),
            ...(options.device !== undefined ? { device: options.device } : {}),
            params: params.values,
            ...(options.scheme !== undefined ? { scheme: options.scheme } : {}),
            ...(options.appDir !== undefined ? { appDir: options.appDir } : {}),
            ...(options.config !== undefined ? { config: options.config } : {}),
            ...(options.package !== undefined ? { packageName: options.package } : {}),
            color: shouldColor(),
          },
          systemExec,
        );
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

/** Parse `--params k=v` tokens into an object, splitting on the first `=`. */
function parseParams(
  tokens: string[],
): { ok: true; values: Record<string, string> } | { ok: false; diagnostic: Diagnostic } {
  const values: Record<string, string> = {};
  for (const token of tokens) {
    const eq = token.indexOf('=');
    if (eq <= 0) {
      return {
        ok: false,
        diagnostic: {
          severity: 'error',
          code: 'PARAMS_INVALID',
          message: `invalid --params entry '${token}'`,
          fix: 'use key=value, e.g. --params id=42.',
        },
      };
    }
    values[token.slice(0, eq)] = token.slice(eq + 1);
  }
  return { ok: true, values };
}
