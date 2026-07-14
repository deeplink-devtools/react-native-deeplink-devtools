import { Command, Option } from 'commander';
import * as clack from '@clack/prompts';
import type { DeepLinkReportEvent, Diagnostic, Route } from '@deeplink-devtools/core';
import { buildRouteUrl, DEFAULT_REPORTER_PORT } from '@deeplink-devtools/core';
import type { ExecFn } from '../exec.js';
import { systemExec } from '../exec.js';
import { ensureAdbReverse, listAndroidDevices, pickAndroidDevice } from '../devices.js';
import { paint, renderDiagnostics, shouldColor } from '../render.js';
import type { ReporterClient, ReporterServer } from '../reporter-server.js';
import { describeReporterClient, startReporterServer } from '../reporter-server.js';
import { loadTable, openAndroid, openIos, resolvePrefix } from './open.js';

/** Inputs to an interactive session, after the CLI has parsed flags. */
export interface InteractiveOptions {
  /** Dev-transport port; defaults to {@link DEFAULT_REPORTER_PORT}. */
  port?: number;
  /** `undefined` = auto (fire wherever a device exists); otherwise strict. */
  platform?: 'ios' | 'android' | 'both';
  device?: string;
  scheme?: string;
  appDir?: string;
  config?: string;
  /** dotenv file backing '@env' imports in the --config module. */
  dotenv?: string;
  packageName?: string;
  color: boolean;
  /** How long to wait for the app's report after firing. */
  reportTimeoutMs?: number;
}

/**
 * The prompt surface the session drives - a thin slice of `@clack/prompts`
 * so tests can script it.
 */
export interface PromptsLike {
  intro(message: string): void;
  outro(message: string): void;
  note(message: string, title?: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  select(options: {
    message: string;
    options: { value: string; label: string; hint?: string; disabled?: boolean }[];
  }): Promise<string | symbol>;
  text(options: { message: string; placeholder?: string }): Promise<string | symbol>;
  isCancel(value: unknown): boolean;
}

/** Injected effects: process execution, prompts, and the transport server. */
export interface InteractiveDeps {
  exec: ExecFn;
  prompts: PromptsLike;
  startServer: (port: number) => Promise<ReporterServer>;
}

/** A deep link the session just fired, for comparison against reports. */
export interface FiredLink {
  route: Route;
  url: string;
  params: Record<string, string>;
}

/** A report received from a connected app. */
export interface ReceivedReport {
  client: ReporterClient;
  event: DeepLinkReportEvent;
}

/**
 * Whether the route the app reports corresponds to the route that was fired.
 * Expo Router reporters send a normalized pattern (`/users/:id`); React
 * Navigation reporters send the focused route's leaf name, which matches the
 * table's ancestry-joined `name` (`HomeTabs/Feed/Article`) by suffix.
 */
export function routeMatches(fired: Route, reported: string): boolean {
  const slashed = (value: string): string => (value.startsWith('/') ? value : `/${value}`);
  return (
    slashed(reported) === slashed(fired.pattern) ||
    reported === fired.name ||
    fired.name.endsWith(`/${reported}`)
  );
}

/**
 * Render one report against the link that was fired: route match, URL echo,
 * and a param-by-param diff. Pure - unit-tested directly.
 */
export function renderReportComparison(
  fired: FiredLink,
  report: ReceivedReport,
  color: boolean,
): string {
  const { event } = report;
  const lines: string[] = [];

  if (event.matchedRoute === null) {
    lines.push(paint(color, 'red', `route   (nothing matched) ✗ - fired ${fired.route.pattern}`));
  } else if (routeMatches(fired.route, event.matchedRoute)) {
    lines.push(`route   ${event.matchedRoute} ✓`);
  } else {
    lines.push(
      paint(color, 'red', `route   ${event.matchedRoute} ✗ - fired ${fired.route.pattern}`),
    );
  }

  lines.push(
    event.url === fired.url
      ? paint(color, 'dim', `url     ${event.url}`)
      : paint(color, 'yellow', `url     ${event.url} (fired ${fired.url})`),
  );

  const reported = new Map(Object.entries(event.params));
  const paramLines: string[] = [];
  for (const [name, value] of Object.entries(fired.params)) {
    if (!reported.has(name)) {
      paramLines.push(paint(color, 'red', `  ${name}: fired '${value}' ✗ not reported`));
    } else {
      const got = reported.get(name);
      // Expo Router echoes catch-all segments as an array; the link was fired
      // from one `a/b/c` string, so join before comparing.
      const kind = fired.route.params.find((param) => param.name === name)?.kind;
      const normalized = kind === 'catch-all' && Array.isArray(got) ? got.join('/') : got;
      const gotText = typeof normalized === 'string' ? normalized : JSON.stringify(normalized);
      if (gotText === value) {
        paramLines.push(`  ${name} = ${value} ✓`);
      } else {
        paramLines.push(paint(color, 'red', `  ${name}: fired '${value}', app got '${gotText}' ✗`));
      }
      reported.delete(name);
    }
  }
  for (const [name, value] of reported) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    paramLines.push(paint(color, 'dim', `  + ${name} = ${text} (not fired)`));
  }
  lines.push(paramLines.length > 0 ? `params\n${paramLines.join('\n')}` : 'params  (none)');

  return lines.join('\n');
}

/**
 * Render the timeout case: the link was fired but no report arrived.
 */
export function renderNoReport(fired: FiredLink, timeoutMs: number, clientCount: number): string {
  const head = `fired ${fired.url}, but no report arrived within ${Math.round(timeoutMs / 1000)}s.`;
  const why =
    clientCount === 0
      ? 'No app is connected - run your app in a development build with useDeepLinkReporter() (see @deeplink-devtools/runtime), then fire again.'
      : 'An app is connected but stayed silent - did the link reach it? Check that the URL scheme opens this app and that the reporter hook is mounted at the root.';
  return `${head}\n${why}`;
}

/** One-line rendering of a report that arrived outside a fire window. */
export function renderObservedReport(report: ReceivedReport): string {
  const { event } = report;
  const params = Object.keys(event.params).length > 0 ? ` ${JSON.stringify(event.params)}` : '';
  return `${describeReporterClient(report.client)}: ${event.url} → ${event.matchedRoute ?? '(no match)'}${params}`;
}

const CANCELLED: unique symbol = Symbol('cancelled');

/** A route whose pattern has a bare `*` segment cannot be built from params. */
function hasUnnamedWildcard(route: Route): boolean {
  return route.pattern.split('/').includes('*');
}

function errorDiag(code: string, message: string, fix: string): Diagnostic {
  return { severity: 'error', code, message, fix };
}

/**
 * Run the interactive session loop. Pure of process state - every effect goes
 * through {@link InteractiveDeps} - and returns the exit code.
 */
export async function runInteractive(
  cwd: string,
  options: InteractiveOptions,
  deps: InteractiveDeps,
): Promise<number> {
  const { exec, prompts } = deps;
  const { color } = options;
  const port = options.port ?? DEFAULT_REPORTER_PORT;
  const timeoutMs = options.reportTimeoutMs ?? 10_000;

  if (
    options.device !== undefined &&
    options.platform !== 'ios' &&
    options.platform !== 'android'
  ) {
    prompts.error(
      renderDiagnostics(
        [
          errorDiag(
            'DEVICE_FLAG_NEEDS_PLATFORM',
            '--device requires an explicit --platform ios or --platform android',
            'add --platform ios (or android), or drop --device.',
          ),
        ],
        color,
      ),
    );
    return 1;
  }

  const table = await loadTable(cwd, options);
  if (!table.ok) {
    prompts.error(renderDiagnostics(table.diagnostics, color));
    return 1;
  }
  const routes = table.table.routes;
  if (routes.length === 0) {
    prompts.error(
      renderDiagnostics(
        [
          errorDiag(
            'NO_ROUTES',
            'the route table is empty - nothing to fire',
            'check --app-dir/--config; run `rndl routes` to inspect what rndl sees.',
          ),
        ],
        color,
      ),
    );
    return 1;
  }

  const schemeNotes: string[] = [];
  const prefix = resolvePrefix(options, table.prefixes, table.appDir ?? cwd, schemeNotes);
  if (prefix === undefined) {
    prompts.error(
      renderDiagnostics(
        [
          errorDiag(
            'SCHEME_NOT_FOUND',
            'cannot determine a URL scheme for this app',
            'pass --scheme <scheme> (e.g. myapp or https://example.com), or add "scheme" to app.json.',
          ),
        ],
        color,
      ),
    );
    return 1;
  }

  let server: ReporterServer;
  try {
    server = await deps.startServer(port);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    prompts.error(
      renderDiagnostics(
        [
          errorDiag(
            'PORT_IN_USE',
            `cannot listen on port ${port}: ${detail}`,
            'stop the other process (another rndl interactive?), or pass --port <n> and call useDeepLinkReporter({ port: n }).',
          ),
        ],
        color,
      ),
    );
    return 1;
  }

  try {
    prompts.intro(
      `rndl interactive - ${routes.length} route${routes.length === 1 ? '' : 's'}, scheme ${prefix}, listening on ws://localhost:${port}`,
    );
    for (const note of schemeNotes) {
      prompts.info(`note: ${note}`);
    }

    await reverseAllAndroid(exec, port, options, prompts);

    // Reports are routed to the active fire window; otherwise they are
    // app-initiated (someone tapped a link) and logged as observations.
    let reportSink: ((report: ReceivedReport) => void) | null = null;
    const unsubscribe = server.onEvent((event) => {
      switch (event.kind) {
        case 'connected':
          prompts.info(`app connected (#${event.client.id})`);
          break;
        case 'hello':
          prompts.info(`${describeReporterClient(event.client)} ready`);
          break;
        case 'disconnected':
          prompts.warn(`${describeReporterClient(event.client)} disconnected`);
          break;
        case 'invalid-message':
          prompts.warn(
            `ignoring a message from ${describeReporterClient(event.client)}: ${event.reason}`,
          );
          break;
        case 'report': {
          const received = { client: event.client, event: event.event };
          if (reportSink !== null) {
            reportSink(received);
          } else {
            prompts.note(renderObservedReport(received), 'deep link observed');
          }
          break;
        }
      }
    });

    if (server.clients().length === 0) {
      prompts.note(
        [
          'No app is connected yet. In your app (development build), add:',
          '',
          "  import { useDeepLinkReporter } from '@deeplink-devtools/runtime/expo-router';",
          '  // or …/react-navigation with your navigationRef',
          '  useDeepLinkReporter();',
          '',
          'Links still fire without it; live reports appear once the app connects.',
        ].join('\n'),
        'waiting for app',
      );
    }

    for (;;) {
      const selection = await prompts.select({
        message: 'Fire a route',
        options: [
          ...routes.map((route, index) => ({
            value: String(index),
            label: route.pattern,
            hint:
              route.params.length > 0
                ? route.params.map((p) => `${p.name}${p.optional ? '?' : ''}`).join(', ')
                : route.name,
            ...(hasUnnamedWildcard(route)
              ? { disabled: true, hint: 'bare * wildcard - use `rndl open <full url>`' }
              : {}),
          })),
          { value: 'quit', label: '(quit)' },
        ],
      });
      if (prompts.isCancel(selection) || selection === 'quit') {
        break;
      }
      const route = routes[Number(selection)] as Route;

      const params = await promptParams(route, prompts);
      if (params === CANCELLED) {
        continue;
      }

      const built = buildRouteUrl(route, params, prefix);
      if (built.url === undefined) {
        prompts.error(
          `cannot build a URL for ${route.pattern}: missing ${built.missing.join(', ')}`,
        );
        continue;
      }
      for (const warning of built.warnings) {
        prompts.warn(warning);
      }
      if (built.extras.length > 0) {
        prompts.info(`extra params appended to the query string: ${built.extras.join(', ')}`);
      }

      const openedCount = await fire(exec, built.url, port, options, prompts);
      if (openedCount === 0) {
        continue;
      }

      prompts.info(`waiting for the app's report (up to ${Math.round(timeoutMs / 1000)}s)…`);
      const reports = await new Promise<ReceivedReport[]>((resolve) => {
        const received: ReceivedReport[] = [];
        const timer = setTimeout(() => {
          reportSink = null;
          resolve(received);
        }, timeoutMs);
        reportSink = (report) => {
          received.push(report);
          if (received.length >= openedCount) {
            clearTimeout(timer);
            reportSink = null;
            resolve(received);
          }
        };
      });

      const fired: FiredLink = { route, url: built.url, params };
      if (reports.length === 0) {
        prompts.note(renderNoReport(fired, timeoutMs, server.clients().length), 'no report');
      } else {
        for (const report of reports) {
          prompts.note(
            renderReportComparison(fired, report, color),
            `report from ${describeReporterClient(report.client)}`,
          );
        }
      }
    }

    unsubscribe();
    prompts.outro('done');
    return 0;
  } finally {
    await server.close();
  }
}

/** Prompt for each of the route's params - required first, optional skippable. */
async function promptParams(
  route: Route,
  prompts: PromptsLike,
): Promise<Record<string, string> | typeof CANCELLED> {
  const values: Record<string, string> = {};
  const ordered = [...route.params].sort((a, b) => Number(a.optional) - Number(b.optional));
  for (const param of ordered) {
    for (;;) {
      const answer = await prompts.text({
        message: `${param.name} (${param.tsType}${param.optional ? ', optional - empty to skip' : ''})`,
        ...(param.kind === 'catch-all' ? { placeholder: 'one/two/three' } : {}),
      });
      if (prompts.isCancel(answer)) {
        return CANCELLED;
      }
      const value = typeof answer === 'string' ? answer.trim() : '';
      if (value === '' && !param.optional) {
        prompts.warn(`${param.name} is required.`);
        continue;
      }
      if (value !== '') {
        values[param.name] = value;
      }
      break;
    }
  }
  return values;
}

/**
 * Fire the URL on the selected platform(s), mirroring `rndl open` semantics
 * (auto vs strict). Returns how many devices the link was opened on.
 */
async function fire(
  exec: ExecFn,
  url: string,
  port: number,
  options: InteractiveOptions,
  prompts: PromptsLike,
): Promise<number> {
  const strict = options.platform !== undefined;
  const platforms: ('ios' | 'android')[] =
    options.platform === 'ios'
      ? ['ios']
      : options.platform === 'android'
        ? ['android']
        : ['ios', 'android'];

  let opened = 0;
  const diagnostics: Diagnostic[] = [];
  for (const platform of platforms) {
    if (platform === 'android') {
      await reverseForFire(exec, port, options, prompts);
    }
    const outcome =
      platform === 'ios'
        ? await openIos(exec, url, options.device, strict)
        : await openAndroid(exec, url, options.device, options.packageName, strict);
    if (outcome.kind === 'opened') {
      opened += 1;
      prompts.info(outcome.line);
      if (outcome.note !== undefined) {
        prompts.info(`note: ${outcome.note}`);
      }
    } else if (outcome.kind === 'skipped') {
      prompts.info(`note: ${outcome.note}`);
    } else {
      diagnostics.push(outcome.diagnostic);
    }
  }
  if (!strict && opened === 0 && diagnostics.length === 0) {
    diagnostics.push(
      errorDiag(
        'NO_DEVICES',
        'no iOS simulator or Android device is available to open the link',
        'boot a simulator / start an emulator / connect a device, or pass --platform to target one.',
      ),
    );
  }
  if (diagnostics.length > 0) {
    prompts.error(renderDiagnostics(diagnostics, options.color));
  }
  return opened;
}

/** At startup: tunnel the dev-transport port on every ready Android device. */
async function reverseAllAndroid(
  exec: ExecFn,
  port: number,
  options: InteractiveOptions,
  prompts: PromptsLike,
): Promise<void> {
  if (options.platform === 'ios') {
    return;
  }
  const listing = await listAndroidDevices(exec);
  if (!listing.ok) {
    if (options.platform === 'android' || options.platform === 'both') {
      prompts.warn(listing.diagnostic.message);
    }
    return;
  }
  for (const device of listing.devices.filter((d) => d.state === 'device')) {
    const result = await ensureAdbReverse(exec, device.serial, port);
    if (result.ok) {
      prompts.info(`adb reverse tcp:${port} ready on ${device.serial}`);
    } else {
      prompts.warn(result.diagnostic.message);
    }
  }
}

/** Right before an Android fire: make sure the target device has the tunnel. */
async function reverseForFire(
  exec: ExecFn,
  port: number,
  options: InteractiveOptions,
  prompts: PromptsLike,
): Promise<void> {
  const listing = await listAndroidDevices(exec);
  if (!listing.ok) {
    return; // openAndroid surfaces the real error with a fix.
  }
  const selection = pickAndroidDevice(listing.devices, options.device);
  if (!selection.ok) {
    return;
  }
  const result = await ensureAdbReverse(exec, selection.device.serial, port);
  if (!result.ok) {
    prompts.warn(result.diagnostic.message);
  }
}

/** The live `@clack/prompts` binding behind {@link PromptsLike}. */
function clackPrompts(): PromptsLike {
  return {
    intro: (message) => clack.intro(message),
    outro: (message) => clack.outro(message),
    note: (message, title) => clack.note(message, title),
    info: (message) => clack.log.info(message),
    warn: (message) => clack.log.warn(message),
    error: (message) => clack.log.error(message),
    select: (options) => clack.select(options),
    text: (options) => clack.text(options),
    isCancel: (value) => clack.isCancel(value),
  };
}

/**
 * `rndl interactive [--port <n>] [--platform ios|android|both] [--device <id>]
 * [--scheme <s>] [--app-dir <dir> | --config <module>] [--dotenv [path]]
 * [--package <name>]` - pick routes, fire them on devices, and watch what the
 * app matches, live.
 */
export function interactiveCommand(): Command {
  return new Command('interactive')
    .description('Fire deep links interactively and watch what the app matches, live')
    .option('--port <port>', `dev-transport port (default ${DEFAULT_REPORTER_PORT})`)
    .addOption(
      new Option('--platform <platform>', 'target platform').choices(['ios', 'android', 'both']),
    )
    .option('--device <id>', 'simulator UDID/name or adb serial (needs an explicit --platform)')
    .option('--scheme <scheme>', 'URL scheme or prefix for built links (e.g. myapp, https://host)')
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
    .addOption(
      new Option(
        '--dotenv [path]',
        "dotenv file backing '@env' imports in the --config module (bare flag: .env)",
      ).preset('.env'),
    )
    .option('--package <name>', 'Android package to receive the intent')
    .action(
      async (options: {
        port?: string;
        platform?: 'ios' | 'android' | 'both';
        device?: string;
        scheme?: string;
        appDir?: string;
        config?: string;
        dotenv?: string;
        package?: string;
      }) => {
        const color = shouldColor();
        if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
          console.error(
            renderDiagnostics(
              [
                errorDiag(
                  'INTERACTIVE_NEEDS_TTY',
                  'rndl interactive needs an interactive terminal',
                  'run it directly in a terminal; for scripting, use `rndl open`.',
                ),
              ],
              color,
            ),
          );
          process.exitCode = 1;
          return;
        }
        let port: number | undefined;
        if (options.port !== undefined) {
          port = Number(options.port);
          if (!Number.isInteger(port) || port < 1 || port > 65_535) {
            console.error(
              renderDiagnostics(
                [
                  errorDiag(
                    'INVALID_PORT',
                    `--port must be an integer between 1 and 65535, got '${options.port}'`,
                    `pass a free TCP port, e.g. --port ${DEFAULT_REPORTER_PORT}.`,
                  ),
                ],
                color,
              ),
            );
            process.exitCode = 1;
            return;
          }
        }
        process.exitCode = await runInteractive(
          process.cwd(),
          {
            ...(port !== undefined ? { port } : {}),
            ...(options.platform !== undefined ? { platform: options.platform } : {}),
            ...(options.device !== undefined ? { device: options.device } : {}),
            ...(options.scheme !== undefined ? { scheme: options.scheme } : {}),
            ...(options.appDir !== undefined ? { appDir: options.appDir } : {}),
            ...(options.config !== undefined ? { config: options.config } : {}),
            ...(options.dotenv !== undefined ? { dotenv: options.dotenv } : {}),
            ...(options.package !== undefined ? { packageName: options.package } : {}),
            color,
          },
          { exec: systemExec, prompts: clackPrompts(), startServer: startReporterServer },
        );
      },
    );
}
