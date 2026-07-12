import type { DeepLinkReportEvent } from '@deeplink-devtools/core';

/**
 * Transport options shared by every reporter entry point.
 */
export interface DeepLinkReporterOptions {
  /**
   * Port the `rndl` CLI listens on. Defaults to rndl's default dev-transport
   * port (7635); override when running `rndl interactive --port <n>`.
   */
  port?: number;
  /**
   * Host the CLI runs on. Defaults to `localhost`, which reaches the CLI from
   * an iOS simulator directly and from Android through the `adb reverse`
   * tunnel that `rndl interactive` sets up automatically.
   */
  host?: string;
}

/**
 * Options for {@link createReporter}, the low-level client for custom router
 * integrations. The router entry points fill these in for you.
 */
export interface CreateReporterOptions extends DeepLinkReporterOptions {
  /** Router integration name announced to the CLI, e.g. `expo-router`. */
  router?: string;
  /** Human-readable app name announced to the CLI. */
  appName?: string;
  /** Platform announced to the CLI; detected from React Native when omitted. */
  platform?: string;
}

/**
 * A connected (or connecting) reporter. Reporting is fire-and-forget: events
 * sent while the CLI is unreachable are buffered briefly and flushed on
 * connect, and every failure path is silent - the reporter never throws and
 * never logs.
 */
export interface DeepLinkReporter {
  /** Report one captured deep-link event. */
  report(event: DeepLinkReportEvent): void;
  /** Close the connection and stop reconnecting. */
  close(): void;
}

/**
 * The slice of a React Navigation container ref the reporter needs. Any ref
 * created with `createNavigationContainerRef()` (or received from
 * `useNavigationContainerRef()`) satisfies it - the type is structural so this
 * package needs no dependency on React Navigation itself.
 */
export interface ReporterNavigationRef {
  /** Whether the navigation tree is mounted and ready to inspect. */
  isReady(): boolean;
  /** The currently focused route, if any. */
  getCurrentRoute(): { name: string; params?: object } | undefined;
  /** Subscribe to navigation-state changes; returns the unsubscribe function. */
  addListener(type: 'state', callback: () => void): () => void;
}
