import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { REPORTER_PROTOCOL_VERSION } from '@deeplink-devtools/core';
import type { ReporterServer, ReporterServerEvent } from './reporter-server.js';
import { describeReporterClient, startReporterServer } from './reporter-server.js';

/** Start a server on an OS-assigned free port by probing from a base. */
async function startOnFreePort(): Promise<ReporterServer> {
  let error: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = 49152 + Math.floor(Math.random() * 16000);
    try {
      return await startReporterServer(port);
    } catch (e) {
      error = e;
    }
  }
  throw error;
}

/**
 * Collect server events and let tests await one of a kind - including events
 * that already arrived (each is consumed at most once).
 */
function recordEvents(server: ReporterServer): {
  events: ReporterServerEvent[];
  next: (kind: ReporterServerEvent['kind']) => Promise<ReporterServerEvent>;
} {
  const events: ReporterServerEvent[] = [];
  const consumed = new Set<number>();
  const waiters: { kind: string; resolve: (event: ReporterServerEvent) => void }[] = [];
  server.onEvent((event) => {
    const index = events.push(event) - 1;
    const waiterIndex = waiters.findIndex((w) => w.kind === event.kind);
    if (waiterIndex !== -1) {
      const [waiter] = waiters.splice(waiterIndex, 1);
      consumed.add(index);
      waiter?.resolve(event);
    }
  });
  return {
    events,
    next: (kind) => {
      const index = events.findIndex((event, i) => event.kind === kind && !consumed.has(i));
      if (index !== -1) {
        consumed.add(index);
        return Promise.resolve(events[index] as ReporterServerEvent);
      }
      return new Promise((resolve) => {
        waiters.push({ kind, resolve });
      });
    },
  };
}

async function connect(port: number): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  await once(socket, 'open');
  return socket;
}

describe('startReporterServer', () => {
  it('accepts a reporter, tracks its hello, receives reports, and sees it leave', async () => {
    const server = await startOnFreePort();
    const recorded = recordEvents(server);
    try {
      const socket = await connect(server.port);
      const connected = await recorded.next('connected');
      expect(connected.kind).toBe('connected');

      const helloArrived = recorded.next('hello');
      socket.send(
        JSON.stringify({
          type: 'hello',
          protocolVersion: REPORTER_PROTOCOL_VERSION,
          platform: 'ios',
          router: 'expo-router',
        }),
      );
      const hello = await helloArrived;
      expect(hello.client).toMatchObject({ platform: 'ios', router: 'expo-router' });
      expect(server.clients()).toHaveLength(1);
      expect(describeReporterClient(hello.client)).toBe('ios app (expo-router)');

      const reportArrived = recorded.next('report');
      socket.send(
        JSON.stringify({
          type: 'report',
          protocolVersion: REPORTER_PROTOCOL_VERSION,
          event: { url: 'myapp://users/7', matchedRoute: '/users/:id', params: { id: '7' }, ts: 5 },
        }),
      );
      const report = await reportArrived;
      expect(report).toMatchObject({
        kind: 'report',
        event: { url: 'myapp://users/7', matchedRoute: '/users/:id', params: { id: '7' } },
      });

      const gone = recorded.next('disconnected');
      socket.close();
      await gone;
      expect(server.clients()).toHaveLength(0);
    } finally {
      await server.close();
    }
  });

  it('flags unparseable frames and wrong protocol versions without dropping the connection', async () => {
    const server = await startOnFreePort();
    const recorded = recordEvents(server);
    try {
      const socket = await connect(server.port);
      await recorded.next('connected');

      const invalid = recorded.next('invalid-message');
      socket.send('not json at all');
      expect((await invalid) as { reason?: string }).toMatchObject({ kind: 'invalid-message' });

      const versioned = recorded.next('invalid-message');
      socket.send(JSON.stringify({ type: 'hello', protocolVersion: 99 }));
      const event = await versioned;
      expect(event.kind).toBe('invalid-message');
      expect((event as { reason: string }).reason).toContain('protocol version 99');

      // Still connected and usable afterwards.
      const reportArrived = recorded.next('report');
      socket.send(
        JSON.stringify({
          type: 'report',
          protocolVersion: REPORTER_PROTOCOL_VERSION,
          event: { url: 'x://y', matchedRoute: null, params: {}, ts: 1 },
        }),
      );
      await reportArrived;
      socket.close();
    } finally {
      await server.close();
    }
  });

  it('rejects when the port is already taken', async () => {
    const server = await startOnFreePort();
    try {
      await expect(startReporterServer(server.port)).rejects.toThrow();
    } finally {
      await server.close();
    }
  });

  it('close() terminates connected reporters', async () => {
    const server = await startOnFreePort();
    const socket = await connect(server.port);
    const closed = once(socket, 'close');
    await server.close();
    await closed;
  });
});

describe('describeReporterClient', () => {
  it('degrades gracefully with partial identity', () => {
    expect(describeReporterClient({ id: 3 })).toBe('app #3');
    expect(describeReporterClient({ id: 1, platform: 'android' })).toBe('android app');
    expect(describeReporterClient({ id: 1, platform: 'ios', appName: 'Example' })).toBe(
      'ios app "Example"',
    );
  });
});
