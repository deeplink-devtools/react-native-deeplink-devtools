import { describe, expect, it } from 'vitest';
import type { ExecFn, ExecResult } from './exec.js';
import {
  listAndroidDevices,
  listIosSimulators,
  parseAdbDevices,
  parseSimctlDevices,
  pickAndroidDevice,
  pickIosSimulator,
  type AndroidDevice,
  type IosSimulator,
} from './devices.js';

/** A fake ExecFn that returns a scripted result for any call. */
const fakeExec =
  (result: Partial<ExecResult>): ExecFn =>
  () =>
    Promise.resolve({ stdout: '', stderr: '', exitCode: 0, notFound: false, ...result });

/** The verified live shape of `simctl list devices --json` (trimmed). */
const SIMCTL_JSON = JSON.stringify({
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-26-4': [
      {
        udid: 'FD414CCB-4E30-4AAF-916F-9B6CB2A50F90',
        name: 'iPhone 17 Pro',
        state: 'Booted',
        isAvailable: true,
        lastBootedAt: '2026-07-06T05:10:30Z',
      },
    ],
    'com.apple.CoreSimulator.SimRuntime.iOS-18-6': [],
    'com.apple.CoreSimulator.SimRuntime.watchOS-11-2': [
      { udid: 'AAAA', name: 'Apple Watch', state: 'Shutdown', isAvailable: false },
    ],
  },
});

describe('parseSimctlDevices', () => {
  it('flattens runtimes and derives the runtime label', () => {
    const sims = parseSimctlDevices(SIMCTL_JSON);
    expect(sims).toHaveLength(2);
    const phone = sims.find((s) => s.name === 'iPhone 17 Pro');
    expect(phone).toMatchObject({ state: 'Booted', runtime: 'iOS 26.4', isAvailable: true });
    expect(sims.find((s) => s.name === 'Apple Watch')).toMatchObject({
      runtime: 'watchOS 11.2',
      isAvailable: false,
    });
  });

  it('throws on unparseable JSON (wrapper handles it)', () => {
    expect(() => parseSimctlDevices('not json')).toThrow();
  });
});

describe('parseAdbDevices', () => {
  it('parses -l output with a model and skips the header', () => {
    const text =
      'List of devices attached\nemulator-5554          device product:sdk model:Pixel_7 device:emu\n';
    expect(parseAdbDevices(text)).toEqual([
      { serial: 'emulator-5554', state: 'device', model: 'Pixel_7' },
    ]);
  });

  it('skips daemon-startup noise lines', () => {
    const text =
      '* daemon not running; starting now at tcp:5037\n* daemon started successfully\nList of devices attached\nABC123 device\n';
    expect(parseAdbDevices(text)).toEqual([{ serial: 'ABC123', state: 'device' }]);
  });

  it('understands the two-word `no permissions` state', () => {
    const text = 'List of devices attached\n0123456789 no permissions\n';
    expect(parseAdbDevices(text)).toEqual([{ serial: '0123456789', state: 'no permissions' }]);
  });

  it('preserves unauthorized and offline states', () => {
    const text = 'List of devices attached\nAAA unauthorized\nBBB offline\n';
    expect(parseAdbDevices(text).map((d) => d.state)).toEqual(['unauthorized', 'offline']);
  });

  it('returns empty for a header-only listing', () => {
    expect(parseAdbDevices('List of devices attached\n\n')).toEqual([]);
  });
});

const sim = (over: Partial<IosSimulator>): IosSimulator => ({
  udid: 'UDID-1',
  name: 'iPhone 17 Pro',
  state: 'Booted',
  isAvailable: true,
  runtime: 'iOS 26.4',
  ...over,
});

describe('pickIosSimulator', () => {
  it('picks the single booted simulator', () => {
    const result = pickIosSimulator([sim({}), sim({ udid: 'U2', state: 'Shutdown' })]);
    expect(result).toEqual({ ok: true, device: expect.objectContaining({ udid: 'UDID-1' }) });
  });

  it('errors when nothing is booted', () => {
    const result = pickIosSimulator([sim({ state: 'Shutdown' })]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostic.code).toBe('NO_BOOTED_SIMULATOR');
  });

  it('picks the most recently booted when several are booted, with a note', () => {
    const result = pickIosSimulator([
      sim({ udid: 'OLD', lastBootedAt: '2026-07-01T00:00:00Z' }),
      sim({ udid: 'NEW', lastBootedAt: '2026-07-06T00:00:00Z' }),
    ]);
    expect(result).toMatchObject({ ok: true, device: { udid: 'NEW' } });
    if (result.ok) expect(result.note).toContain('most recently booted');
  });

  it('matches --device by udid case-insensitively and by exact name', () => {
    const sims = [sim({ udid: 'ABC-123' })];
    expect(pickIosSimulator(sims, 'abc-123')).toMatchObject({ ok: true });
    expect(pickIosSimulator(sims, 'iPhone 17 Pro')).toMatchObject({ ok: true });
  });

  it('errors when --device matches a shutdown simulator', () => {
    const result = pickIosSimulator([sim({ udid: 'ABC', state: 'Shutdown' })], 'ABC');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostic.code).toBe('DEVICE_NOT_BOOTED');
  });

  it('errors when --device matches nothing', () => {
    const result = pickIosSimulator([sim({})], 'nope');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostic.code).toBe('DEVICE_NOT_FOUND');
  });
});

const dev = (over: Partial<AndroidDevice>): AndroidDevice => ({
  serial: 'emulator-5554',
  state: 'device',
  ...over,
});

describe('pickAndroidDevice', () => {
  it('picks the single ready device', () => {
    expect(pickAndroidDevice([dev({})])).toMatchObject({
      ok: true,
      device: { serial: 'emulator-5554' },
    });
  });

  it('errors when none are connected', () => {
    const result = pickAndroidDevice([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostic.code).toBe('NO_ANDROID_DEVICE');
  });

  it('explains an unauthorized-only device', () => {
    const result = pickAndroidDevice([dev({ serial: 'X', state: 'unauthorized' })]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostic.code).toBe('DEVICE_UNAUTHORIZED');
  });

  it('errors on multiple devices, listing serials', () => {
    const result = pickAndroidDevice([dev({ serial: 'A' }), dev({ serial: 'B' })]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.code).toBe('MULTIPLE_ANDROID_DEVICES');
      expect(result.diagnostic.message).toContain('A');
      expect(result.diagnostic.message).toContain('B');
    }
  });

  it('matches --device by exact serial', () => {
    expect(pickAndroidDevice([dev({ serial: 'A' }), dev({ serial: 'B' })], 'B')).toMatchObject({
      ok: true,
      device: { serial: 'B' },
    });
  });
});

describe('listIosSimulators / listAndroidDevices', () => {
  it('maps a missing xcrun to an actionable diagnostic', async () => {
    const result = await listIosSimulators(fakeExec({ notFound: true, exitCode: -1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostic.code).toBe('XCRUN_NOT_FOUND');
  });

  it('maps a missing adb to an actionable diagnostic', async () => {
    const result = await listAndroidDevices(fakeExec({ notFound: true, exitCode: -1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostic.code).toBe('ADB_NOT_FOUND');
  });

  it('parses a successful simctl listing', async () => {
    const result = await listIosSimulators(fakeExec({ stdout: SIMCTL_JSON }));
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.devices).toHaveLength(2);
  });

  it('flags unparseable simctl JSON', async () => {
    const result = await listIosSimulators(fakeExec({ stdout: 'garbage' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostic.code).toBe('SIMCTL_UNPARSEABLE');
  });
});
