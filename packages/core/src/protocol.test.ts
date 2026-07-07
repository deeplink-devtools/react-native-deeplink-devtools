import { describe, expect, it } from 'vitest';
import type { ReporterHello, ReporterMessage, ReporterReport } from './protocol.js';
import {
  DEFAULT_REPORTER_PORT,
  REPORTER_PROTOCOL_VERSION,
  parseReporterMessage,
} from './protocol.js';

const hello: ReporterHello = {
  type: 'hello',
  protocolVersion: REPORTER_PROTOCOL_VERSION,
  platform: 'ios',
  router: 'expo-router',
  appName: 'example',
};

const report: ReporterReport = {
  type: 'report',
  protocolVersion: REPORTER_PROTOCOL_VERSION,
  event: {
    url: 'myapp://users/42',
    matchedRoute: '/users/:id',
    params: { id: '42' },
    ts: 1_720_000_000_000,
  },
};

describe('protocol constants', () => {
  it('pins version 1 and a registered-range default port', () => {
    expect(REPORTER_PROTOCOL_VERSION).toBe(1);
    expect(Number.isInteger(DEFAULT_REPORTER_PORT)).toBe(true);
    expect(DEFAULT_REPORTER_PORT).toBeGreaterThan(1023);
    expect(DEFAULT_REPORTER_PORT).toBeLessThan(49152);
  });
});

describe('parseReporterMessage: hello', () => {
  it('round-trips a full hello', () => {
    expect(parseReporterMessage(JSON.stringify(hello))).toEqual(hello);
  });

  it('accepts a minimal hello without identity fields', () => {
    const minimal: ReporterMessage = { type: 'hello', protocolVersion: 1 };
    expect(parseReporterMessage(JSON.stringify(minimal))).toEqual(minimal);
  });

  it('drops unknown extra fields', () => {
    const parsed = parseReporterMessage(JSON.stringify({ ...hello, extra: 'x' }));
    expect(parsed).toEqual(hello);
  });

  it('keeps an unknown protocol version so the receiver can tell newer peers from garbage', () => {
    const parsed = parseReporterMessage(JSON.stringify({ type: 'hello', protocolVersion: 99 }));
    expect(parsed).toEqual({ type: 'hello', protocolVersion: 99 });
  });

  it('rejects a hello with non-string identity fields', () => {
    expect(
      parseReporterMessage(JSON.stringify({ type: 'hello', protocolVersion: 1, platform: 7 })),
    ).toBeUndefined();
    expect(
      parseReporterMessage(JSON.stringify({ type: 'hello', protocolVersion: 1, router: null })),
    ).toBeUndefined();
  });
});

describe('parseReporterMessage: report', () => {
  it('round-trips a report', () => {
    expect(parseReporterMessage(JSON.stringify(report))).toEqual(report);
  });

  it('accepts a null matchedRoute (nothing matched)', () => {
    const unmatched = {
      ...report,
      event: { ...report.event, matchedRoute: null },
    };
    expect(parseReporterMessage(JSON.stringify(unmatched))).toEqual(unmatched);
  });

  it('rejects a report with a malformed event', () => {
    const bad = (event: unknown): string =>
      JSON.stringify({ type: 'report', protocolVersion: 1, event });
    expect(parseReporterMessage(bad(undefined))).toBeUndefined();
    expect(parseReporterMessage(bad('not-an-object'))).toBeUndefined();
    expect(parseReporterMessage(bad({ matchedRoute: null, params: {}, ts: 1 }))).toBeUndefined();
    expect(
      parseReporterMessage(bad({ url: 'x://y', matchedRoute: 3, params: {}, ts: 1 })),
    ).toBeUndefined();
    expect(
      parseReporterMessage(bad({ url: 'x://y', matchedRoute: null, params: [], ts: 1 })),
    ).toBeUndefined();
    expect(
      parseReporterMessage(bad({ url: 'x://y', matchedRoute: null, params: {}, ts: 'now' })),
    ).toBeUndefined();
  });
});

describe('parseReporterMessage: malformed frames', () => {
  it('never throws on garbage', () => {
    for (const raw of ['', 'not json', '42', '"str"', 'null', '[]', '{}', '{"type":"hello"}']) {
      expect(parseReporterMessage(raw)).toBeUndefined();
    }
  });

  it('rejects unknown message types', () => {
    expect(
      parseReporterMessage(JSON.stringify({ type: 'goodbye', protocolVersion: 1 })),
    ).toBeUndefined();
  });

  it('rejects a missing or non-numeric protocolVersion', () => {
    expect(parseReporterMessage(JSON.stringify({ type: 'hello' }))).toBeUndefined();
    expect(
      parseReporterMessage(JSON.stringify({ type: 'hello', protocolVersion: '1' })),
    ).toBeUndefined();
  });
});
