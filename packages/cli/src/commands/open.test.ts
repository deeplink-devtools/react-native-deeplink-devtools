import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExecFn, ExecResult } from '../exec.js';
import { runOpen, schemeNotFoundFix, type OpenOptions } from './open.js';

// Temp dir for the schemeNotFoundFix tests, cleaned up after each test.
let dir: string | undefined;

afterEach(() => {
  if (dir !== undefined) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

const EXPO_APP_DIR = fileURLToPath(
  new URL('../../../../example-expo-router/src/app', import.meta.url),
);
const EXPO_APP_ROOT = fileURLToPath(new URL('../../../../example-expo-router', import.meta.url));
const RNAV_LINKING = fileURLToPath(
  new URL('../../../../example-react-navigation/src/navigation/linking.ts', import.meta.url),
);

/** One booted iPhone in simctl JSON form. */
const BOOTED_SIMCTL = JSON.stringify({
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-26-4': [
      { udid: 'SIM-UDID', name: 'iPhone 17 Pro', state: 'Booted', isAvailable: true },
    ],
  },
});
const EMPTY_SIMCTL = JSON.stringify({ devices: {} });

const ok = (stdout = ''): ExecResult => ({ stdout, stderr: '', exitCode: 0, notFound: false });
/** An `adb devices -l` listing with one ready emulator. */
const ADB_ONE_DEVICE = 'List of devices attached\nemulator-5554          device model:Pixel_7\n';
const fail = (stderr: string, exitCode = 1): ExecResult => ({
  stdout: '',
  stderr,
  exitCode,
  notFound: false,
});
const missing = (): ExecResult => ({ stdout: '', stderr: '', exitCode: -1, notFound: true });

/** A recording fake exec driven by a handler keyed on `file` + first arg. */
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

const opts = (over: Partial<OpenOptions> = {}): OpenOptions => ({
  params: {},
  color: false,
  ...over,
});

describe('runOpen: URL mode', () => {
  it('opens a URL on the iOS simulator with the exact simctl argv', async () => {
    const exec = scriptedExec((file, args) => {
      if (file === 'xcrun' && args[1] === 'list') return ok(BOOTED_SIMCTL);
      return ok();
    });
    const output = await runOpen(
      'exampleexporouter://users/42',
      '/tmp',
      opts({ platform: 'ios' }),
      exec,
    );
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain(
      'opened exampleexporouter://users/42 on iPhone 17 Pro (SIM-UDID)',
    );
    expect(exec.calls).toContainEqual({
      file: 'xcrun',
      args: ['simctl', 'openurl', 'SIM-UDID', 'exampleexporouter://users/42'],
    });
  });

  it('opens on Android with a device-shell-quoted URL (single-quotes & ampersand)', async () => {
    const exec = scriptedExec((file, args) => {
      if (file === 'adb' && args[0] === 'devices') return ok(ADB_ONE_DEVICE);
      return ok();
    });
    const url = "myapp://x?a=1&b='c'";
    const output = await runOpen(url, '/tmp', opts({ platform: 'android' }), exec);
    expect(output.exitCode).toBe(0);
    const adbCall = exec.calls.find((c) => c.file === 'adb' && c.args.includes('start'));
    expect(adbCall?.args).toEqual([
      '-s',
      'emulator-5554',
      'shell',
      'am',
      'start',
      '-W',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      "'myapp://x?a=1&b='\\''c'\\'''",
    ]);
  });

  it('appends --package to the Android intent', async () => {
    const exec = scriptedExec((file, args) =>
      file === 'adb' && args[0] === 'devices' ? ok(ADB_ONE_DEVICE) : ok(),
    );
    await runOpen(
      'myapp://x',
      '/tmp',
      opts({ platform: 'android', packageName: 'com.example.app' }),
      exec,
    );
    const adbCall = exec.calls.find((c) => c.args.includes('start'));
    expect(adbCall?.args.at(-1)).toBe('com.example.app');
  });

  it('detects am start exiting 0 with an Error: on stdout', async () => {
    const exec = scriptedExec((file, args) => {
      if (file === 'adb' && args[0] === 'devices') return ok(ADB_ONE_DEVICE);
      if (file === 'adb' && args.includes('start'))
        return {
          stdout: 'Error: Activity not started, unable to resolve Intent',
          stderr: '',
          exitCode: 0,
          notFound: false,
        };
      return ok();
    });
    const output = await runOpen('myapp://x', '/tmp', opts({ platform: 'android' }), exec);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('ANDROID_OPEN_FAILED');
  });
});

describe('runOpen: device availability', () => {
  it('auto mode opens on iOS and notes Android is unavailable', async () => {
    const exec = scriptedExec((file, args) => {
      if (file === 'xcrun' && args[1] === 'list') return ok(BOOTED_SIMCTL);
      if (file === 'adb') return ok('List of devices attached\n\n');
      return ok();
    });
    const output = await runOpen('myapp://x', '/tmp', opts(), exec);
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain('opened myapp://x on iPhone 17 Pro');
    expect(output.stdout).toContain('Android: skipped');
  });

  it('auto mode with no devices anywhere errors NO_DEVICES', async () => {
    const exec = scriptedExec((file, args) => {
      if (file === 'xcrun' && args[1] === 'list') return ok(EMPTY_SIMCTL);
      if (file === 'adb') return ok('List of devices attached\n\n');
      return ok();
    });
    const output = await runOpen('myapp://x', '/tmp', opts(), exec);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('NO_DEVICES');
  });

  it('explicit --platform android with no device errors (strict)', async () => {
    const exec = scriptedExec(() => ok('List of devices attached\n\n'));
    const output = await runOpen('myapp://x', '/tmp', opts({ platform: 'android' }), exec);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('NO_ANDROID_DEVICE');
  });

  it('errors when --device is used without an explicit single platform', async () => {
    const exec = scriptedExec(() => ok());
    const output = await runOpen('myapp://x', '/tmp', opts({ device: 'X' }), exec);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('DEVICE_FLAG_NEEDS_PLATFORM');
    expect(exec.calls).toHaveLength(0);
  });

  it('surfaces an iOS open failure with the no-app hint', async () => {
    const exec = scriptedExec((file, args) => {
      if (file === 'xcrun' && args[1] === 'list') return ok(BOOTED_SIMCTL);
      if (file === 'xcrun' && args[1] === 'openurl')
        return fail('domain=LSApplicationWorkspaceErrorDomain, code=115');
      return ok();
    });
    const output = await runOpen('myapp://x', '/tmp', opts({ platform: 'ios' }), exec);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('IOS_OPEN_FAILED');
    expect(output.stderr).toContain('no app on this simulator');
  });

  it('reports a missing toolchain in strict mode', async () => {
    const exec = scriptedExec(() => missing());
    const output = await runOpen('myapp://x', '/tmp', opts({ platform: 'ios' }), exec);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('XCRUN_NOT_FOUND');
  });
});

describe('runOpen: route mode', () => {
  it('builds a URL from the expo example app + app.json scheme', async () => {
    const exec = scriptedExec((file, args) =>
      file === 'xcrun' && args[1] === 'list' ? ok(BOOTED_SIMCTL) : ok(),
    );
    const output = await runOpen(
      '/users/:id',
      EXPO_APP_ROOT,
      opts({ platform: 'ios', appDir: EXPO_APP_DIR, params: { id: '42' } }),
      exec,
    );
    expect(output.exitCode).toBe(0);
    expect(exec.calls).toContainEqual({
      file: 'xcrun',
      args: ['simctl', 'openurl', 'SIM-UDID', 'exampleexporouter://users/42'],
    });
  });

  it('builds from a React Navigation config with the config prefix', async () => {
    const exec = scriptedExec((file, args) =>
      file === 'xcrun' && args[1] === 'list' ? ok(BOOTED_SIMCTL) : ok(),
    );
    const output = await runOpen(
      'HomeTabs/Feed/Article',
      '/tmp',
      opts({ platform: 'ios', config: RNAV_LINKING, params: { slug: 'hello' } }),
      exec,
    );
    expect(output.exitCode).toBe(0);
    expect(exec.calls).toContainEqual({
      file: 'xcrun',
      args: ['simctl', 'openurl', 'SIM-UDID', 'examplereactnavigation://feed/article/hello'],
    });
  });

  it('errors on a missing required param before touching any device', async () => {
    const exec = scriptedExec(() => ok());
    const output = await runOpen(
      '/users/:id',
      EXPO_APP_ROOT,
      opts({ platform: 'ios', appDir: EXPO_APP_DIR }),
      exec,
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('OPEN_MISSING_PARAMS');
    expect(output.stderr).toContain('id');
    expect(exec.calls).toHaveLength(0);
  });

  it('suggests near-misses when the route is not found', async () => {
    const exec = scriptedExec(() => ok());
    const output = await runOpen(
      'user',
      EXPO_APP_ROOT,
      opts({ platform: 'ios', appDir: EXPO_APP_DIR }),
      exec,
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('ROUTE_NOT_FOUND');
    expect(output.stderr).toContain('/users/:id');
  });

  it('honors an explicit --scheme over app.json', async () => {
    const exec = scriptedExec((file, args) =>
      file === 'xcrun' && args[1] === 'list' ? ok(BOOTED_SIMCTL) : ok(),
    );
    const output = await runOpen(
      '/users/:id',
      EXPO_APP_ROOT,
      opts({
        platform: 'ios',
        appDir: EXPO_APP_DIR,
        params: { id: '7' },
        scheme: 'https://example.com',
      }),
      exec,
    );
    expect(output.exitCode).toBe(0);
    expect(exec.calls).toContainEqual({
      file: 'xcrun',
      args: ['simctl', 'openurl', 'SIM-UDID', 'https://example.com/users/7'],
    });
  });
});

describe('schemeNotFoundFix', () => {
  it('names a dynamic Expo config when one is present', () => {
    dir = mkdtempSync(join(tmpdir(), 'rndl-scheme-'));
    writeFileSync(join(dir, 'app.config.ts'), 'export default {};');
    const fix = schemeNotFoundFix(dir);
    expect(fix).toContain('app.config.ts');
    expect(fix).toContain('does not evaluate');
    expect(fix).toContain('--scheme');
  });

  it('gives the plain guidance when no dynamic config exists', () => {
    dir = mkdtempSync(join(tmpdir(), 'rndl-scheme-'));
    const fix = schemeNotFoundFix(dir);
    expect(fix).toBe(
      'pass --scheme <scheme> (e.g. myapp or https://example.com), or add "scheme" to app.json.',
    );
  });
});
