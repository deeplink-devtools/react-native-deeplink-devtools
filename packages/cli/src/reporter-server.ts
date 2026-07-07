import { WebSocketServer } from 'ws';
import { parseReporterMessage, REPORTER_PROTOCOL_VERSION } from '@deeplink-devtools/core';
import type { DeepLinkReportEvent } from '@deeplink-devtools/core';

/** One connected reporter (an app instance), identified by its hello. */
export interface ReporterClient {
  id: number;
  platform?: string;
  router?: string;
  appName?: string;
}

/** Everything the dev-transport server can tell a session. */
export type ReporterServerEvent =
  | { kind: 'connected'; client: ReporterClient }
  | { kind: 'hello'; client: ReporterClient }
  | { kind: 'report'; client: ReporterClient; event: DeepLinkReportEvent }
  | { kind: 'disconnected'; client: ReporterClient }
  | { kind: 'invalid-message'; client: ReporterClient; reason: string };

/**
 * The dev-transport server as the interactive session sees it — an interface
 * so tests can substitute a scripted fake.
 */
export interface ReporterServer {
  /** The port actually bound. */
  port: number;
  /** Currently connected reporters. */
  clients(): ReporterClient[];
  /** Subscribe to server events; returns the unsubscribe function. */
  onEvent(listener: (event: ReporterServerEvent) => void): () => void;
  /** Drop every connection and stop listening. */
  close(): Promise<void>;
}

/**
 * Human label for a connected reporter, e.g. `ios app (expo-router)` or
 * `app #2`.
 */
export function describeReporterClient(client: ReporterClient): string {
  const base = client.platform !== undefined ? `${client.platform} app` : `app #${client.id}`;
  const name = client.appName !== undefined ? ` ${JSON.stringify(client.appName)}` : '';
  const router = client.router !== undefined ? ` (${client.router})` : '';
  return `${base}${name}${router}`;
}

/**
 * Start the WebSocket server the in-app reporter connects to. Resolves once
 * the port is bound; rejects (typically `EADDRINUSE`) when it cannot bind.
 * Incoming frames are validated with core's `parseReporterMessage` — a
 * reporter speaking a different protocol version is surfaced as an
 * `invalid-message` event with an actionable reason, never a crash.
 */
export function startReporterServer(port: number): Promise<ReporterServer> {
  return new Promise((resolve, reject) => {
    const server = new WebSocketServer({ port, host: '127.0.0.1' });
    const listeners = new Set<(event: ReporterServerEvent) => void>();
    const connected = new Map<number, ReporterClient>();
    let nextId = 1;

    const emit = (event: ReporterServerEvent): void => {
      for (const listener of listeners) {
        listener(event);
      }
    };

    server.on('connection', (socket) => {
      const client: ReporterClient = { id: nextId };
      nextId += 1;
      connected.set(client.id, client);
      emit({ kind: 'connected', client });

      socket.on('message', (data) => {
        const raw = Array.isArray(data)
          ? Buffer.concat(data).toString('utf8')
          : data instanceof ArrayBuffer
            ? Buffer.from(data).toString('utf8')
            : data.toString('utf8');
        const message = parseReporterMessage(raw);
        if (message === undefined) {
          emit({ kind: 'invalid-message', client, reason: 'unparseable frame — not a reporter?' });
          return;
        }
        if (message.protocolVersion !== REPORTER_PROTOCOL_VERSION) {
          emit({
            kind: 'invalid-message',
            client,
            reason: `protocol version ${message.protocolVersion} (this rndl speaks ${REPORTER_PROTOCOL_VERSION}) — update rndl and @deeplink-devtools/runtime to matching versions.`,
          });
          return;
        }
        if (message.type === 'hello') {
          if (message.platform !== undefined) {
            client.platform = message.platform;
          }
          if (message.router !== undefined) {
            client.router = message.router;
          }
          if (message.appName !== undefined) {
            client.appName = message.appName;
          }
          emit({ kind: 'hello', client });
          return;
        }
        emit({ kind: 'report', client, event: message.event });
      });

      socket.on('close', () => {
        if (connected.delete(client.id)) {
          emit({ kind: 'disconnected', client });
        }
      });
      socket.on('error', () => {
        // Socket-level errors surface as a close right after; nothing to do.
      });
    });

    server.once('error', reject);
    server.once('listening', () => {
      server.removeListener('error', reject);
      server.on('error', () => {
        // Post-listen server errors: connections fail individually; keep serving.
      });
      resolve({
        port,
        clients: () => [...connected.values()],
        onEvent: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        close: () =>
          new Promise<void>((done) => {
            for (const socket of server.clients) {
              socket.terminate();
            }
            server.close(() => done());
          }),
      });
    });
  });
}
