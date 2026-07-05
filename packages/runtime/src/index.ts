/**
 * A deep-link event captured in the app and reported to the `rndl` CLI during development.
 *
 * The reporter hook that emits these events ships in an upcoming release. Its contract:
 * development-only, and a guaranteed no-op in production builds.
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
