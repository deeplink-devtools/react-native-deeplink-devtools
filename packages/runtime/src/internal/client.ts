import type { DeepLinkReportEvent, ReporterMessage } from '@deeplink-devtools/core';
import type { CreateReporterOptions, DeepLinkReporter } from '../types.js';
import { backoffDelayMs, pushBounded } from './policy.js';

/**
 * Default dev-transport port. Kept as a literal so production code never
 * imports `@deeplink-devtools/core` at runtime; a unit test pins it to core's
 * `DEFAULT_REPORTER_PORT`.
 */
export const DEFAULT_PORT = 7635;

/** Protocol version spoken; pinned to core's `REPORTER_PROTOCOL_VERSION` by a unit test. */
const PROTOCOL_VERSION = 1;

/** Events buffered while the CLI is unreachable; older ones are dropped. */
const MAX_BUFFERED_EVENTS = 20;

/**
 * The slice of a WebSocket the reporter drives. React Native's global
 * `WebSocket` satisfies it.
 */
export interface WebSocketLike {
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

/**
 * Injection seam for tests: how the client obtains a socket.
 */
export interface ReporterClientDeps {
  /** Defaults to `new WebSocket(url)` (React Native's built-in client). */
  createSocket?: (url: string) => WebSocketLike;
}

function defaultCreateSocket(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike;
}

function detectPlatform(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- best-effort probe; this module only ever loads in development builds.
    const rn = require('react-native') as { Platform?: { OS?: string } };
    return rn.Platform?.OS;
  } catch {
    return undefined;
  }
}

/**
 * The real reporter used in development builds: connects to the `rndl` CLI's
 * WebSocket server, announces itself, and forwards captured events. Silent by
 * design — the CLI not running is the normal case, so every failure path is
 * swallowed and reconnects back off quietly ({@link backoffDelayMs}).
 */
export function createReporterImpl(
  options: CreateReporterOptions = {},
  deps: ReporterClientDeps = {},
): DeepLinkReporter {
  const url = `ws://${options.host ?? 'localhost'}:${options.port ?? DEFAULT_PORT}`;
  const createSocket = deps.createSocket ?? defaultCreateSocket;
  const platform = options.platform ?? detectPlatform();

  const hello: ReporterMessage = {
    type: 'hello',
    protocolVersion: PROTOCOL_VERSION,
    ...(platform !== undefined ? { platform } : {}),
    ...(options.router !== undefined ? { router: options.router } : {}),
    ...(options.appName !== undefined ? { appName: options.appName } : {}),
  };

  let closed = false;
  let open = false;
  let socket: WebSocketLike | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  const buffered: DeepLinkReportEvent[] = [];

  const sendRaw = (message: ReporterMessage): void => {
    if (socket === null) {
      return;
    }
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // Fire-and-forget: a lost frame is not worth disturbing the app for.
    }
  };

  const scheduleRetry = (): void => {
    if (closed || retryTimer !== null) {
      return;
    }
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (!closed) {
        connect();
      }
    }, backoffDelayMs(attempt));
    attempt += 1;
  };

  const connect = (): void => {
    let next: WebSocketLike;
    try {
      next = createSocket(url);
    } catch {
      scheduleRetry();
      return;
    }
    socket = next;
    next.onopen = () => {
      if (closed || socket !== next) {
        return;
      }
      open = true;
      attempt = 0;
      sendRaw(hello);
      for (const event of buffered) {
        sendRaw({ type: 'report', protocolVersion: PROTOCOL_VERSION, event });
      }
      buffered.length = 0;
    };
    next.onclose = () => {
      if (socket !== next) {
        return;
      }
      open = false;
      socket = null;
      scheduleRetry();
    };
    next.onerror = () => {
      if (socket !== next || open) {
        return;
      }
      // Failed before opening: detach and retry ourselves — not every stack
      // follows an error with a close event.
      socket = null;
      try {
        next.close();
      } catch {
        // Already dead.
      }
      scheduleRetry();
    };
  };

  connect();

  return {
    report(event: DeepLinkReportEvent): void {
      if (closed) {
        return;
      }
      if (open && socket !== null) {
        sendRaw({ type: 'report', protocolVersion: PROTOCOL_VERSION, event });
      } else {
        pushBounded(buffered, event, MAX_BUFFERED_EVENTS);
      }
    },
    close(): void {
      closed = true;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      const current = socket;
      socket = null;
      open = false;
      if (current !== null) {
        try {
          current.close();
        } catch {
          // Already dead.
        }
      }
    },
  };
}
