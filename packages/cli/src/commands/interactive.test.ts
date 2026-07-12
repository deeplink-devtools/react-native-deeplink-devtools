import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Route } from '@deeplink-devtools/core';
import type { ExecFn, ExecResult } from '../exec.js';
import type { ReporterClient, ReporterServer, ReporterServerEvent } from '../reporter-server.js';
import type { PromptsLike } from './interactive.js';
import {
  renderNoReport,
  renderReportComparison,
  routeMatches,
  runInteractive,
} from './interactive.js';

const EXPO_APP_DIR = fileURLToPath(
  new URL('../../../../example-expo-router/src/app', import.meta.url),
);

const BOOTED_SIMCTL = JSON.stringify({
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-26-4': [
      { udid: 'SIM-UDID', name: 'iPhone 17 Pro', state: 'Booted', isAvailable: true },
    ],
  },
});
const ADB_ONE_DEVICE = 'List of devices attached\nemulator-5554          device model:Pixel_7\n';

const ok = (stdout = ''): ExecResult => ({ stdout, stderr: '', exitCode: 0, notFound: false });
const missing = (): ExecResult => ({ stdout: '', stderr: '', exitCode: -1, notFound: true });

function scriptedExec(
  handler: (file: string, args: string[]) => ExecResult,
): ExecFn & { calls: { file: string; args: string[] }[] } {
  const calls: { file: string; args: string[] }[] = [];
  const fn = (file: string, args: string[]) => {
    calls.push({ file, args });
    return Promise.resolve(handler(file, args));
  };
  return Object.assign(fn, { calls });
}

const FAKE_CANCEL: unique symbol = Symbol('cancel');

type SelectOpts = Parameters<PromptsLike['select']>[0];
type Responder<Opts> = string | symbol | ((opts: Opts) => string | symbol);

/** Scripted prompt fake: queued responses, recorded output. */
class FakePrompts implements PromptsLike {
  readonly output: { kind: string; message: string; title?: string }[] = [];
  readonly selectCalls: SelectOpts[] = [];

  constructor(
    private readonly selects: Responder<SelectOpts>[],
    private readonly texts: Responder<unknown>[] = [],
  ) {}

  private push(kind: string, message: string, title?: string): void {
    this.output.push({ kind, message, ...(title !== undefined ? { title } : {}) });
  }

  intro(message: string): void {
    this.push('intro', message);
  }
  outro(message: string): void {
    this.push('outro', message);
  }
  note(message: string, title?: string): void {
    this.push('note', message, title);
  }
  info(message: string): void {
    this.push('info', message);
  }
  warn(message: string): void {
    this.push('warn', message);
  }
  error(message: string): void {
    this.push('error', message);
  }

  select(opts: SelectOpts): Promise<string | symbol> {
    this.selectCalls.push(opts);
    const next = this.selects.shift() ?? 'quit';
    return Promise.resolve(typeof next === 'function' ? next(opts) : next);
  }

  text(opts: unknown): Promise<string | symbol> {
    const next = this.texts.shift() ?? '';
    return Promise.resolve(typeof next === 'function' ? next(opts) : next);
  }

  isCancel(value: unknown): boolean {
    return value === FAKE_CANCEL;
  }

  /** All recorded output of one kind, joined for easy matching. */
  text_of(kind: string): string {
    return this.output
      .filter((entry) => entry.kind === kind)
      .map((entry) => `${entry.title ?? ''}\n${entry.message}`)
      .join('\n');
  }
}

/** Pick the select option whose label equals `label`. */
const byLabel =
  (label: string) =>
  (opts: SelectOpts): string | symbol =>
    opts.options.find((option) => option.label === label)?.value ?? 'quit';

function fakeReporterServer(port = 7635): {
  server: ReporterServer;
  state: { closed: boolean };
  emit: (event: ReporterServerEvent) => void;
  setClients: (clients: ReporterClient[]) => void;
} {
  const listeners = new Set<(event: ReporterServerEvent) => void>();
  let clientList: ReporterClient[] = [];
  const state = { closed: false };
  return {
    server: {
      port,
      clients: () => clientList,
      onEvent: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      close: () => {
        state.closed = true;
        return Promise.resolve();
      },
    },
    state,
    emit: (event) => {
      for (const listener of listeners) {
        listener(event);
      }
    },
    setClients: (clients) => {
      clientList = clients;
    },
  };
}

const iosClient: ReporterClient = { id: 1, platform: 'ios', router: 'expo-router' };

describe('runInteractive', () => {
  it('fires a selected route and renders a matching report', async () => {
    const { server, state, emit, setClients } = fakeReporterServer();
    setClients([iosClient]);
    const exec = scriptedExec((file, args) => {
      if (file === 'xcrun' && args[1] === 'list') return ok(BOOTED_SIMCTL);
      if (file === 'xcrun' && args[1] === 'openurl') {
        setTimeout(() => {
          emit({
            kind: 'report',
            client: iosClient,
            event: {
              url: 'myapp://users/42',
              matchedRoute: '/users/:id',
              params: { id: '42' },
              ts: 1,
            },
          });
        }, 0);
        return ok();
      }
      return ok();
    });
    const prompts = new FakePrompts([byLabel('/users/:id'), 'quit'], ['42']);

    const code = await runInteractive(
      '/tmp',
      {
        appDir: EXPO_APP_DIR,
        scheme: 'myapp',
        platform: 'ios',
        color: false,
        reportTimeoutMs: 500,
      },
      { exec, prompts, startServer: () => Promise.resolve(server) },
    );

    expect(code).toBe(0);
    expect(exec.calls).toContainEqual({
      file: 'xcrun',
      args: ['simctl', 'openurl', 'SIM-UDID', 'myapp://users/42'],
    });
    const notes = prompts.text_of('note');
    expect(notes).toContain('route   /users/:id ✓');
    expect(notes).toContain('id = 42 ✓');
    expect(state.closed).toBe(true);
  });

  it('highlights a mismatched report', async () => {
    const { server, emit, setClients } = fakeReporterServer();
    setClients([iosClient]);
    const exec = scriptedExec((file, args) => {
      if (file === 'xcrun' && args[1] === 'list') return ok(BOOTED_SIMCTL);
      if (file === 'xcrun' && args[1] === 'openurl') {
        setTimeout(() => {
          emit({
            kind: 'report',
            client: iosClient,
            event: {
              url: 'myapp://users/42',
              matchedRoute: '/+not-found',
              params: { id: '43' },
              ts: 1,
            },
          });
        }, 0);
        return ok();
      }
      return ok();
    });
    const prompts = new FakePrompts([byLabel('/users/:id'), 'quit'], ['42']);

    const code = await runInteractive(
      '/tmp',
      {
        appDir: EXPO_APP_DIR,
        scheme: 'myapp',
        platform: 'ios',
        color: false,
        reportTimeoutMs: 500,
      },
      { exec, prompts, startServer: () => Promise.resolve(server) },
    );

    expect(code).toBe(0);
    const notes = prompts.text_of('note');
    expect(notes).toContain('route   /+not-found ✗ - fired /users/:id');
    expect(notes).toContain("id: fired '42', app got '43' ✗");
  });

  it('explains a report timeout, distinguishing no-app-connected', async () => {
    const { server } = fakeReporterServer();
    const exec = scriptedExec((file, args) =>
      file === 'xcrun' && args[1] === 'list' ? ok(BOOTED_SIMCTL) : ok(),
    );
    const prompts = new FakePrompts([byLabel('/users/:id'), 'quit'], ['42']);

    const code = await runInteractive(
      '/tmp',
      {
        appDir: EXPO_APP_DIR,
        scheme: 'myapp',
        platform: 'ios',
        color: false,
        reportTimeoutMs: 30,
      },
      { exec, prompts, startServer: () => Promise.resolve(server) },
    );

    expect(code).toBe(0);
    const notes = prompts.text_of('note');
    expect(notes).toContain('no report arrived within');
    expect(notes).toContain('No app is connected');
  });

  it('sets up adb reverse at startup and again before an Android fire', async () => {
    const { server } = fakeReporterServer();
    const exec = scriptedExec((file, args) => {
      if (file === 'adb' && args[0] === 'devices') return ok(ADB_ONE_DEVICE);
      return ok();
    });
    const prompts = new FakePrompts([byLabel('/users/:id'), 'quit'], ['42']);

    const code = await runInteractive(
      '/tmp',
      {
        appDir: EXPO_APP_DIR,
        scheme: 'myapp',
        platform: 'android',
        color: false,
        reportTimeoutMs: 30,
      },
      { exec, prompts, startServer: () => Promise.resolve(server) },
    );

    expect(code).toBe(0);
    const reverses = exec.calls.filter((c) => c.file === 'adb' && c.args.includes('reverse'));
    expect(reverses).toHaveLength(2);
    expect(reverses[0]?.args).toEqual(['-s', 'emulator-5554', 'reverse', 'tcp:7635', 'tcp:7635']);
    // The tunnel is (re-)established before the intent fires.
    const fireIndex = exec.calls.findIndex((c) => c.args.includes('start'));
    const lastReverseIndex = exec.calls.reduce(
      (last, call, index) => (call.args.includes('reverse') ? index : last),
      -1,
    );
    expect(lastReverseIndex).toBeGreaterThan(-1);
    expect(lastReverseIndex).toBeLessThan(fireIndex);
  });

  it('quits cleanly from the route list and closes the server', async () => {
    const { server, state } = fakeReporterServer();
    const exec = scriptedExec(() => missing());
    const prompts = new FakePrompts(['quit']);

    const code = await runInteractive(
      '/tmp',
      { appDir: EXPO_APP_DIR, scheme: 'myapp', platform: 'ios', color: false },
      { exec, prompts, startServer: () => Promise.resolve(server) },
    );

    expect(code).toBe(0);
    expect(prompts.text_of('outro')).toContain('done');
    expect(state.closed).toBe(true);
  });

  it('re-prompts for a required param until a value arrives', async () => {
    const { server } = fakeReporterServer();
    const exec = scriptedExec((file, args) =>
      file === 'xcrun' && args[1] === 'list' ? ok(BOOTED_SIMCTL) : ok(),
    );
    const prompts = new FakePrompts([byLabel('/users/:id'), 'quit'], ['', '  ', '42']);

    await runInteractive(
      '/tmp',
      {
        appDir: EXPO_APP_DIR,
        scheme: 'myapp',
        platform: 'ios',
        color: false,
        reportTimeoutMs: 10,
      },
      { exec, prompts, startServer: () => Promise.resolve(server) },
    );

    expect(prompts.text_of('warn')).toContain('id is required.');
    expect(exec.calls).toContainEqual({
      file: 'xcrun',
      args: ['simctl', 'openurl', 'SIM-UDID', 'myapp://users/42'],
    });
  });

  it('a cancelled param prompt returns to the route list without firing', async () => {
    const { server } = fakeReporterServer();
    const exec = scriptedExec((file, args) =>
      file === 'xcrun' && args[1] === 'list' ? ok(BOOTED_SIMCTL) : ok(),
    );
    const prompts = new FakePrompts([byLabel('/users/:id'), 'quit'], [FAKE_CANCEL]);

    const code = await runInteractive(
      '/tmp',
      { appDir: EXPO_APP_DIR, scheme: 'myapp', platform: 'ios', color: false },
      { exec, prompts, startServer: () => Promise.resolve(server) },
    );

    expect(code).toBe(0);
    expect(exec.calls.some((c) => c.args.includes('openurl'))).toBe(false);
  });

  it('rejects --device without an explicit platform', async () => {
    const { server } = fakeReporterServer();
    const prompts = new FakePrompts([]);
    const code = await runInteractive(
      '/tmp',
      { appDir: EXPO_APP_DIR, scheme: 'myapp', device: 'SIM-UDID', color: false },
      { exec: scriptedExec(() => ok()), prompts, startServer: () => Promise.resolve(server) },
    );
    expect(code).toBe(1);
    expect(prompts.text_of('error')).toContain('DEVICE_FLAG_NEEDS_PLATFORM');
  });

  it('reports a bind failure with the port and a fix', async () => {
    const prompts = new FakePrompts([]);
    const code = await runInteractive(
      '/tmp',
      { appDir: EXPO_APP_DIR, scheme: 'myapp', port: 7000, color: false },
      {
        exec: scriptedExec(() => ok()),
        prompts,
        startServer: () => Promise.reject(new Error('listen EADDRINUSE')),
      },
    );
    expect(code).toBe(1);
    const errors = prompts.text_of('error');
    expect(errors).toContain('PORT_IN_USE');
    expect(errors).toContain('7000');
  });

  it('logs reports that arrive outside a fire window as observations', async () => {
    const { server, emit } = fakeReporterServer();
    const exec = scriptedExec(() => missing());
    let emitted = false;
    const prompts = new FakePrompts([
      (opts) => {
        if (!emitted) {
          emitted = true;
          emit({
            kind: 'report',
            client: iosClient,
            event: { url: 'myapp://about', matchedRoute: '/about', params: {}, ts: 1 },
          });
        }
        return byLabel('(quit)')(opts);
      },
    ]);

    await runInteractive(
      '/tmp',
      { appDir: EXPO_APP_DIR, scheme: 'myapp', color: false },
      { exec, prompts, startServer: () => Promise.resolve(server) },
    );

    const notes = prompts.text_of('note');
    expect(notes).toContain('deep link observed');
    expect(notes).toContain('myapp://about → /about');
  });
});

describe('routeMatches', () => {
  const route = (name: string, pattern: string): Route => ({
    name,
    pattern,
    params: [],
    exact: true,
  });

  it('matches a normalized pattern (expo-router reporters)', () => {
    expect(routeMatches(route('(tabs)/users/[id]', '/users/:id'), '/users/:id')).toBe(true);
    expect(routeMatches(route('(tabs)/users/[id]', '/users/:id'), 'users/:id')).toBe(true);
  });

  it('matches a leaf route name against an ancestry-joined table name (react-navigation)', () => {
    expect(routeMatches(route('HomeTabs/Feed/Article', '/article/:id'), 'Article')).toBe(true);
    expect(routeMatches(route('Article', '/article/:id'), 'Article')).toBe(true);
  });

  it('rejects an unrelated route', () => {
    expect(routeMatches(route('HomeTabs/Feed/Article', '/article/:id'), 'Settings')).toBe(false);
  });
});

describe('renderReportComparison', () => {
  const fired = {
    route: { name: 'users/[id]', pattern: '/users/:id', params: [], exact: true },
    url: 'myapp://users/42?tab=posts',
    params: { id: '42', tab: 'posts' },
  };

  it('marks agreement and echoes extras dimly', () => {
    const text = renderReportComparison(
      fired,
      {
        client: iosClient,
        event: {
          url: 'myapp://users/42?tab=posts',
          matchedRoute: '/users/:id',
          params: { id: '42', tab: 'posts', ref: 'home' },
          ts: 1,
        },
      },
      false,
    );
    expect(text).toContain('route   /users/:id ✓');
    expect(text).toContain('id = 42 ✓');
    expect(text).toContain('+ ref = home (not fired)');
  });

  it('marks a null match, a differing URL, and missing params', () => {
    const text = renderReportComparison(
      fired,
      {
        client: iosClient,
        event: { url: 'myapp://users/42', matchedRoute: null, params: { id: '42' }, ts: 1 },
      },
      false,
    );
    expect(text).toContain('(nothing matched) ✗');
    expect(text).toContain('(fired myapp://users/42?tab=posts)');
    expect(text).toContain("tab: fired 'posts' ✗ not reported");
  });

  it('tolerates a router parsing a param to a non-string of equal value', () => {
    const text = renderReportComparison(
      fired,
      {
        client: iosClient,
        event: {
          url: fired.url,
          matchedRoute: '/users/:id',
          params: { id: 42, tab: 'posts' },
          ts: 1,
        },
      },
      false,
    );
    expect(text).toContain('id = 42 ✓');
  });

  it('joins an array-valued catch-all param before comparing (Expo Router echoes arrays)', () => {
    const firedCatchAll = {
      route: {
        name: 'posts/[...slug]',
        pattern: '/posts/*slug',
        params: [{ name: 'slug', kind: 'catch-all' as const, optional: false, tsType: 'string[]' }],
        exact: false,
      },
      url: 'myapp://posts/one/two/three',
      params: { slug: 'one/two/three' },
    };
    const text = renderReportComparison(
      firedCatchAll,
      {
        client: iosClient,
        event: {
          url: firedCatchAll.url,
          matchedRoute: '/posts/*slug',
          params: { slug: ['one', 'two', 'three'] },
          ts: 1,
        },
      },
      false,
    );
    expect(text).toContain('slug = one/two/three ✓');
    expect(text).not.toContain('✗');
  });

  it('still flags a catch-all whose joined value differs from what was fired', () => {
    const firedCatchAll = {
      route: {
        name: 'posts/[...slug]',
        pattern: '/posts/*slug',
        params: [{ name: 'slug', kind: 'catch-all' as const, optional: false, tsType: 'string[]' }],
        exact: false,
      },
      url: 'myapp://posts/one/two',
      params: { slug: 'one/two' },
    };
    const text = renderReportComparison(
      firedCatchAll,
      {
        client: iosClient,
        event: {
          url: firedCatchAll.url,
          matchedRoute: '/posts/*slug',
          params: { slug: ['one', 'other'] },
          ts: 1,
        },
      },
      false,
    );
    expect(text).toContain("slug: fired 'one/two', app got 'one/other' ✗");
  });
});

describe('renderNoReport', () => {
  const fired = {
    route: { name: 'about', pattern: '/about', params: [], exact: true },
    url: 'myapp://about',
    params: {},
  };

  it('suggests wiring the reporter when nothing is connected', () => {
    const text = renderNoReport(fired, 10_000, 0);
    expect(text).toContain('within 10s');
    expect(text).toContain('useDeepLinkReporter()');
  });

  it('suggests checking the scheme when an app is connected but silent', () => {
    const text = renderNoReport(fired, 10_000, 1);
    expect(text).toContain('stayed silent');
  });
});
