import {
  DEFAULT_REPORTER_PORT,
  REPORTER_PROTOCOL_VERSION,
  parseReporterMessage,
} from '@deeplink-devtools/core';
import type { DeepLinkReportEvent } from '@deeplink-devtools/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocketLike } from './client.js';
import { createReporterImpl, DEFAULT_PORT } from './client.js';

class FakeSocket implements WebSocketLike {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  closed = false;
  sendThrows = false;

  constructor(readonly url: string) {}

  send(data: string): void {
    if (this.sendThrows) {
      throw new Error('socket gone');
    }
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }
}

function socketFactory(): { sockets: FakeSocket[]; createSocket: (url: string) => WebSocketLike } {
  const sockets: FakeSocket[] = [];
  return {
    sockets,
    createSocket: (url: string) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
  };
}

const event = (n: number): DeepLinkReportEvent => ({
  url: `myapp://items/${n}`,
  matchedRoute: '/items/:id',
  params: { id: String(n) },
  ts: n,
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createReporterImpl', () => {
  it('shares core protocol constants without importing core at runtime', () => {
    expect(DEFAULT_PORT).toBe(DEFAULT_REPORTER_PORT);
  });

  it('connects to the configured host/port and identifies itself first', () => {
    const { sockets, createSocket } = socketFactory();
    createReporterImpl(
      { port: 4242, host: '10.0.0.5', router: 'expo-router', appName: 'example', platform: 'ios' },
      { createSocket },
    );
    expect(sockets).toHaveLength(1);
    const socket = sockets[0] as FakeSocket;
    expect(socket.url).toBe('ws://10.0.0.5:4242');

    socket.onopen?.();
    const hello = parseReporterMessage(socket.sent[0] as string);
    expect(hello).toEqual({
      type: 'hello',
      protocolVersion: REPORTER_PROTOCOL_VERSION,
      platform: 'ios',
      router: 'expo-router',
      appName: 'example',
    });
  });

  it('defaults to localhost and the default port', () => {
    const { sockets, createSocket } = socketFactory();
    createReporterImpl({ platform: 'ios' }, { createSocket });
    expect((sockets[0] as FakeSocket).url).toBe(`ws://localhost:${DEFAULT_PORT}`);
  });

  it('buffers events until open, then flushes them after the hello in order', () => {
    const { sockets, createSocket } = socketFactory();
    const reporter = createReporterImpl({ platform: 'ios' }, { createSocket });
    reporter.report(event(1));
    reporter.report(event(2));
    const socket = sockets[0] as FakeSocket;
    expect(socket.sent).toHaveLength(0);

    socket.onopen?.();
    const messages = socket.sent.map((raw) => parseReporterMessage(raw));
    expect(messages.map((m) => m?.type)).toEqual(['hello', 'report', 'report']);
    expect(messages[1]).toMatchObject({ event: event(1) });
    expect(messages[2]).toMatchObject({ event: event(2) });
  });

  it('sends immediately once open', () => {
    const { sockets, createSocket } = socketFactory();
    const reporter = createReporterImpl({ platform: 'ios' }, { createSocket });
    const socket = sockets[0] as FakeSocket;
    socket.onopen?.();
    reporter.report(event(7));
    expect(parseReporterMessage(socket.sent[1] as string)).toEqual({
      type: 'report',
      protocolVersion: REPORTER_PROTOCOL_VERSION,
      event: event(7),
    });
  });

  it('drops the oldest events beyond the buffer cap', () => {
    const { sockets, createSocket } = socketFactory();
    const reporter = createReporterImpl({ platform: 'ios' }, { createSocket });
    for (let n = 0; n < 25; n += 1) {
      reporter.report(event(n));
    }
    const socket = sockets[0] as FakeSocket;
    socket.onopen?.();
    const reports = socket.sent.slice(1).map((raw) => parseReporterMessage(raw));
    expect(reports).toHaveLength(20);
    expect(reports[0]).toMatchObject({ event: event(5) });
    expect(reports[19]).toMatchObject({ event: event(24) });
  });

  it('reconnects with growing backoff and resets after a successful open', () => {
    const { sockets, createSocket } = socketFactory();
    createReporterImpl({ platform: 'ios' }, { createSocket });
    (sockets[0] as FakeSocket).onclose?.();

    vi.advanceTimersByTime(1999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    (sockets[1] as FakeSocket).onclose?.();
    vi.advanceTimersByTime(3999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    // A successful open resets the schedule to 2s again.
    (sockets[2] as FakeSocket).onopen?.();
    (sockets[2] as FakeSocket).onclose?.();
    vi.advanceTimersByTime(2000);
    expect(sockets).toHaveLength(4);
  });

  it('retries when the socket errors before ever opening', () => {
    const { sockets, createSocket } = socketFactory();
    createReporterImpl({ platform: 'ios' }, { createSocket });
    const socket = sockets[0] as FakeSocket;
    socket.onerror?.();
    expect(socket.closed).toBe(true);
    // A late close event from the same socket must not double-schedule.
    socket.onclose?.();
    vi.advanceTimersByTime(2000);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(2);
  });

  it('never throws in an environment without a WebSocket global', () => {
    vi.stubGlobal('WebSocket', undefined);
    const reporter = createReporterImpl({ platform: 'ios' });
    expect(() => {
      reporter.report(event(1));
      reporter.close();
    }).not.toThrow();
    vi.unstubAllGlobals();
  });

  it('retries when the socket constructor itself throws', () => {
    let calls = 0;
    const { sockets, createSocket } = socketFactory();
    const reporter = createReporterImpl(
      { platform: 'ios' },
      {
        createSocket: (url) => {
          calls += 1;
          if (calls === 1) {
            throw new Error('no WebSocket here');
          }
          return createSocket(url);
        },
      },
    );
    expect(sockets).toHaveLength(0);
    vi.advanceTimersByTime(2000);
    expect(sockets).toHaveLength(1);
    reporter.close();
  });

  it('close() stops everything: socket closed, no more retries, reports ignored', () => {
    const { sockets, createSocket } = socketFactory();
    const reporter = createReporterImpl({ platform: 'ios' }, { createSocket });
    const socket = sockets[0] as FakeSocket;
    socket.onopen?.();
    reporter.close();
    expect(socket.closed).toBe(true);

    reporter.report(event(1));
    expect(socket.sent).toHaveLength(1); // just the hello

    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });

  it('never throws when send fails', () => {
    const { sockets, createSocket } = socketFactory();
    const reporter = createReporterImpl({ platform: 'ios' }, { createSocket });
    const socket = sockets[0] as FakeSocket;
    socket.sendThrows = true;
    socket.onopen?.();
    expect(() => reporter.report(event(1))).not.toThrow();
  });

  it('omits identity fields it does not know', () => {
    const { sockets, createSocket } = socketFactory();
    createReporterImpl({ platform: 'ios' }, { createSocket });
    const socket = sockets[0] as FakeSocket;
    socket.onopen?.();
    expect(parseReporterMessage(socket.sent[0] as string)).toEqual({
      type: 'hello',
      protocolVersion: REPORTER_PROTOCOL_VERSION,
      platform: 'ios',
    });
  });
});
