import type { Diagnostic } from '@deeplink-devtools/core';
import type { ExecFn } from './exec.js';

/** A parsed iOS simulator from `xcrun simctl list devices --json`. */
export interface IosSimulator {
  udid: string;
  name: string;
  /** e.g. `Booted`, `Shutdown`. */
  state: string;
  isAvailable: boolean;
  /** Human runtime label derived from the runtime key, e.g. `iOS 26.4`. */
  runtime: string;
  /** ISO timestamp of the last boot, when the simulator reports one. */
  lastBootedAt?: string;
}

/** A parsed Android device from `adb devices -l`. */
export interface AndroidDevice {
  serial: string;
  /** e.g. `device`, `offline`, `unauthorized`, `no permissions`. */
  state: string;
  model?: string;
}

/** Selecting a single device either succeeds (maybe with a note) or yields a diagnostic. */
export type DeviceSelection<T> =
  { ok: true; device: T; note?: string } | { ok: false; diagnostic: Diagnostic };

/** Listing devices either succeeds or yields a diagnostic explaining the toolchain failure. */
export type DeviceListing<T> = { ok: true; devices: T[] } | { ok: false; diagnostic: Diagnostic };

/** Shape of one runtime entry inside `simctl list devices --json`. */
interface SimctlDeviceEntry {
  udid?: string;
  name?: string;
  state?: string;
  isAvailable?: boolean;
  lastBootedAt?: string;
}

/** Turn a runtime key (`com.apple.CoreSimulator.SimRuntime.iOS-26-4`) into `iOS 26.4`. */
function runtimeLabel(key: string): string {
  const tail = key.split('.').pop() ?? key;
  const dash = tail.indexOf('-');
  if (dash === -1) {
    return tail;
  }
  return `${tail.slice(0, dash)} ${tail.slice(dash + 1).replace(/-/g, '.')}`;
}

/**
 * Parse the JSON from `xcrun simctl list devices --json` into a flat list of
 * simulators, each tagged with a human runtime label. Throws only on
 * unparseable JSON (the {@link listIosSimulators} wrapper catches it).
 */
export function parseSimctlDevices(json: string): IosSimulator[] {
  const parsed = JSON.parse(json) as { devices?: Record<string, SimctlDeviceEntry[]> };
  const byRuntime = parsed.devices ?? {};
  const out: IosSimulator[] = [];
  for (const [runtimeKey, entries] of Object.entries(byRuntime)) {
    const runtime = runtimeLabel(runtimeKey);
    for (const entry of entries) {
      if (typeof entry.udid !== 'string' || typeof entry.name !== 'string') {
        continue;
      }
      out.push({
        udid: entry.udid,
        name: entry.name,
        state: entry.state ?? 'Unknown',
        isAvailable: entry.isAvailable !== false,
        runtime,
        ...(entry.lastBootedAt !== undefined ? { lastBootedAt: entry.lastBootedAt } : {}),
      });
    }
  }
  return out;
}

/**
 * Parse `adb devices -l` output. Skips the `List of devices attached` header,
 * blank lines, and `* daemon ...` startup-noise lines; understands the
 * two-word `no permissions` state and extracts the `model:` field when present.
 */
export function parseAdbDevices(text: string): AndroidDevice[] {
  const out: AndroidDevice[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (
      line === '' ||
      line.startsWith('*') ||
      line.startsWith('List of devices') ||
      line.startsWith('adb server')
    ) {
      continue;
    }
    const tokens = line.split(/\s+/);
    const serial = tokens[0];
    if (serial === undefined) {
      continue;
    }
    // `no permissions` is the only multi-word state adb emits.
    const state = tokens[1] === 'no' && tokens[2] === 'permissions' ? 'no permissions' : tokens[1];
    if (state === undefined) {
      continue;
    }
    const modelToken = tokens.find((token) => token.startsWith('model:'));
    out.push({
      serial,
      state,
      ...(modelToken !== undefined ? { model: modelToken.slice('model:'.length) } : {}),
    });
  }
  return out;
}

function selectionError(
  code: string,
  message: string,
  fix: string,
): { ok: false; diagnostic: Diagnostic } {
  return { ok: false, diagnostic: { severity: 'error', code, message, fix } };
}

/**
 * Choose an iOS simulator to open on. With `deviceFlag`, matches a UDID
 * (case-insensitive) or an exact name; without it, requires exactly one booted
 * simulator (multiple booted → the most recently booted, with a note).
 */
export function pickIosSimulator(
  sims: IosSimulator[],
  deviceFlag?: string,
): DeviceSelection<IosSimulator> {
  const available = sims.filter((sim) => sim.isAvailable);

  if (deviceFlag !== undefined) {
    const wanted = deviceFlag.toLowerCase();
    const match = available.find(
      (sim) => sim.udid.toLowerCase() === wanted || sim.name === deviceFlag,
    );
    if (match === undefined) {
      const names = available.map((sim) => `${sim.name} (${sim.runtime})`).slice(0, 8);
      return selectionError(
        'DEVICE_NOT_FOUND',
        `no available simulator matches '${deviceFlag}'`,
        `pick one of: ${names.join(', ') || '(none available)'} — or open it in Simulator.app.`,
      );
    }
    if (match.state !== 'Booted') {
      return selectionError(
        'DEVICE_NOT_BOOTED',
        `simulator '${match.name}' is ${match.state}, not booted`,
        `boot it first: xcrun simctl boot "${match.udid}".`,
      );
    }
    return { ok: true, device: match };
  }

  const booted = available.filter((sim) => sim.state === 'Booted');
  if (booted.length === 0) {
    const names = available.map((sim) => sim.name).slice(0, 6);
    return selectionError(
      'NO_BOOTED_SIMULATOR',
      'no booted iOS simulator',
      `open Simulator.app or boot one, e.g. xcrun simctl boot "${names[0] ?? '<name>'}". Available: ${names.join(', ') || '(none)'}.`,
    );
  }
  if (booted.length === 1) {
    return { ok: true, device: booted[0] as IosSimulator };
  }
  const sorted = [...booted].sort((a, b) =>
    (b.lastBootedAt ?? '').localeCompare(a.lastBootedAt ?? ''),
  );
  const chosen = sorted[0] as IosSimulator;
  return {
    ok: true,
    device: chosen,
    note: `${booted.length} simulators booted; using ${chosen.name} (most recently booted) — pass --device to choose another.`,
  };
}

/**
 * Choose an Android device to open on. With `deviceFlag`, matches a serial
 * exactly; without it, requires exactly one device in the `device` state
 * (multiple → an error listing serials, since adb offers no way to pick).
 */
export function pickAndroidDevice(
  devices: AndroidDevice[],
  deviceFlag?: string,
): DeviceSelection<AndroidDevice> {
  if (deviceFlag !== undefined) {
    const match = devices.find((device) => device.serial === deviceFlag);
    if (match === undefined) {
      const serials = devices.map((device) => device.serial);
      return selectionError(
        'DEVICE_NOT_FOUND',
        `no attached device has serial '${deviceFlag}'`,
        `attached serials: ${serials.join(', ') || '(none)'} — check adb devices.`,
      );
    }
    if (match.state !== 'device') {
      return selectionError(
        match.state === 'unauthorized' ? 'DEVICE_UNAUTHORIZED' : 'DEVICE_OFFLINE',
        `device '${deviceFlag}' is ${match.state}`,
        match.state === 'unauthorized'
          ? 'accept the USB-debugging prompt on the device, then re-run.'
          : 'reconnect the device or restart it, then re-run.',
      );
    }
    return { ok: true, device: match };
  }

  const ready = devices.filter((device) => device.state === 'device');
  if (ready.length === 0) {
    const unauthorized = devices.filter((device) => device.state === 'unauthorized');
    if (unauthorized.length > 0) {
      return selectionError(
        'DEVICE_UNAUTHORIZED',
        `device ${unauthorized[0]?.serial} is unauthorized`,
        'accept the USB-debugging prompt on the device, then re-run.',
      );
    }
    return selectionError(
      'NO_ANDROID_DEVICE',
      'no Android device or emulator is connected',
      'start an emulator or plug in a device (check `adb devices`), then re-run.',
    );
  }
  if (ready.length === 1) {
    return { ok: true, device: ready[0] as AndroidDevice };
  }
  const serials = ready.map((device) => device.serial);
  return selectionError(
    'MULTIPLE_ANDROID_DEVICES',
    `${ready.length} Android devices attached: ${serials.join(', ')}`,
    `pass --device <serial> to choose one.`,
  );
}

/** List iOS simulators via the injected exec, mapping toolchain failures to diagnostics. */
export async function listIosSimulators(exec: ExecFn): Promise<DeviceListing<IosSimulator>> {
  const result = await exec('xcrun', ['simctl', 'list', 'devices', '--json']);
  if (result.notFound) {
    return {
      ok: false,
      diagnostic: {
        severity: 'error',
        code: 'XCRUN_NOT_FOUND',
        message: 'xcrun is not installed (iOS simulators need the Xcode command line tools)',
        fix: 'install them with: xcode-select --install (macOS only).',
      },
    };
  }
  if (result.exitCode !== 0) {
    return {
      ok: false,
      diagnostic: {
        severity: 'error',
        code: 'SIMCTL_FAILED',
        message: `xcrun simctl failed: ${result.stderr.trim() || `exit ${result.exitCode}`}`,
        fix: 'check that Xcode and its Simulator runtimes are installed.',
      },
    };
  }
  try {
    return { ok: true, devices: parseSimctlDevices(result.stdout) };
  } catch {
    return {
      ok: false,
      diagnostic: {
        severity: 'error',
        code: 'SIMCTL_UNPARSEABLE',
        message: 'could not parse `xcrun simctl list devices --json` output',
        fix: 'update Xcode, or report this with your `xcrun --version`.',
      },
    };
  }
}

/**
 * Set up the `adb reverse` tunnel that lets an app on `serial` reach the dev
 * transport at `localhost:<port>`. Idempotent — re-running for an existing
 * tunnel succeeds.
 */
export async function ensureAdbReverse(
  exec: ExecFn,
  serial: string,
  port: number,
): Promise<{ ok: true } | { ok: false; diagnostic: Diagnostic }> {
  const result = await exec('adb', ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
  if (result.notFound) {
    return {
      ok: false,
      diagnostic: {
        severity: 'error',
        code: 'ADB_NOT_FOUND',
        message: 'adb is not installed (Android devices need the Android platform-tools)',
        fix: 'install the platform-tools and add them to PATH (e.g. via Android Studio or `brew install android-platform-tools`).',
      },
    };
  }
  if (result.exitCode !== 0) {
    return {
      ok: false,
      diagnostic: {
        severity: 'error',
        code: 'ADB_REVERSE_FAILED',
        message: `adb reverse tcp:${port} failed on ${serial}: ${result.stderr.trim() || `exit ${result.exitCode}`}`,
        fix: 'reconnect the device (check `adb devices`), then re-run.',
      },
    };
  }
  return { ok: true };
}

/** List Android devices via the injected exec, mapping toolchain failures to diagnostics. */
export async function listAndroidDevices(exec: ExecFn): Promise<DeviceListing<AndroidDevice>> {
  const result = await exec('adb', ['devices', '-l']);
  if (result.notFound) {
    return {
      ok: false,
      diagnostic: {
        severity: 'error',
        code: 'ADB_NOT_FOUND',
        message: 'adb is not installed (Android devices need the Android platform-tools)',
        fix: 'install the platform-tools and add them to PATH (e.g. via Android Studio or `brew install android-platform-tools`).',
      },
    };
  }
  if (result.exitCode !== 0) {
    return {
      ok: false,
      diagnostic: {
        severity: 'error',
        code: 'ADB_FAILED',
        message: `adb failed: ${result.stderr.trim() || `exit ${result.exitCode}`}`,
        fix: 'check your Android platform-tools install.',
      },
    };
  }
  return { ok: true, devices: parseAdbDevices(result.stdout) };
}
