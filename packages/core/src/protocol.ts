/**
 * The dev-transport protocol spoken between the in-app reporter
 * (`@deeplink-devtools/runtime`) and the `rndl` CLI.
 *
 * Transport: the CLI runs a WebSocket server on localhost; the app connects
 * and sends newline-free JSON text frames, one message per frame. The
 * protocol is one-way (app to CLI); the CLI never sends messages back.
 */

/**
 * Version of the protocol described by this module. A reporter stamps every
 * message with the version it speaks; the CLI rejects versions it does not
 * understand rather than mis-parsing them.
 */
export const REPORTER_PROTOCOL_VERSION = 1;

/**
 * Default TCP port for the dev transport — `rndl` on a phone keypad.
 * Overridable on both ends (`rndl interactive --port`, `useDeepLinkReporter({ port })`).
 */
export const DEFAULT_REPORTER_PORT = 7635;

/**
 * A deep-link event captured in the app and reported to the `rndl` CLI during
 * development.
 */
export interface DeepLinkReportEvent {
  /** The URL the app received. */
  url: string;
  /** Name of the route the router resolved for the URL, or `null` if nothing matched. */
  matchedRoute: string | null;
  /** Route params as parsed by the router. */
  params: Record<string, unknown>;
  /** Capture time, in milliseconds since the Unix epoch. */
  ts: number;
}

/**
 * The first message a reporter sends after connecting, identifying the app.
 */
export interface ReporterHello {
  type: 'hello';
  /** Protocol version the reporter speaks; see {@link REPORTER_PROTOCOL_VERSION}. */
  protocolVersion: number;
  /** Reporting platform; well-known values are `ios` and `android`. */
  platform?: string;
  /** Router integration in use; well-known values are `expo-router` and `react-navigation`. */
  router?: string;
  /** Human-readable app name, when the reporter knows one. */
  appName?: string;
}

/**
 * One captured deep-link event.
 */
export interface ReporterReport {
  type: 'report';
  /** Protocol version the reporter speaks; see {@link REPORTER_PROTOCOL_VERSION}. */
  protocolVersion: number;
  /** The captured event. */
  event: DeepLinkReportEvent;
}

/**
 * Every message a reporter can send.
 */
export type ReporterMessage = ReporterHello | ReporterReport;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function parseEvent(value: unknown): DeepLinkReportEvent | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { url, matchedRoute, params, ts } = value;
  if (typeof url !== 'string') {
    return undefined;
  }
  if (matchedRoute !== null && typeof matchedRoute !== 'string') {
    return undefined;
  }
  if (!isRecord(params)) {
    return undefined;
  }
  if (typeof ts !== 'number' || !Number.isFinite(ts)) {
    return undefined;
  }
  return { url, matchedRoute, params, ts };
}

/**
 * Parse one raw text frame into a {@link ReporterMessage}.
 *
 * Structural validation only — a message with an unknown `protocolVersion`
 * still parses so the receiver can tell "newer peer" apart from garbage.
 * Unknown extra fields are dropped. Never throws; malformed input returns
 * `undefined`.
 */
export function parseReporterMessage(raw: string): ReporterMessage | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const { type, protocolVersion } = value;
  if (typeof protocolVersion !== 'number' || !Number.isFinite(protocolVersion)) {
    return undefined;
  }

  if (type === 'hello') {
    const { platform, router, appName } = value;
    if (!optionalString(platform) || !optionalString(router) || !optionalString(appName)) {
      return undefined;
    }
    return {
      type: 'hello',
      protocolVersion,
      ...(platform !== undefined ? { platform } : {}),
      ...(router !== undefined ? { router } : {}),
      ...(appName !== undefined ? { appName } : {}),
    };
  }

  if (type === 'report') {
    const event = parseEvent(value['event']);
    if (event === undefined) {
      return undefined;
    }
    return { type: 'report', protocolVersion, event };
  }

  return undefined;
}
