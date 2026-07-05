/**
 * Structural types for the subset of React Navigation's linking configuration
 * this adapter reads. Deliberately hand-rolled rather than imported from
 * `@react-navigation/native` so the package installs without any React Native
 * dependency chain; the shape was verified against `@react-navigation/core`
 * 7.21 (`getStateFromPath.tsx`, `validatePathConfig.tsx`), and the golden test
 * against a real `LinkingOptions`-typed config guards drift.
 */

/** Per-param parser map: `{ id: Number }` turns the raw string into a value. */
export type ReactNavigationParseConfig = Record<string, (value: string) => unknown>;

/** Per-param serializer map used when React Navigation builds a URL. */
export type ReactNavigationStringifyConfig = Record<string, (value: never) => string>;

/** An `alias` entry: an extra incoming-URL pattern for the same screen. */
export type ReactNavigationAlias =
  | string
  | {
      path: string;
      exact?: boolean;
      parse?: ReactNavigationParseConfig;
    };

/** Object form of a screen's linking configuration. */
export interface ReactNavigationPathConfig {
  /** URL pattern, e.g. `users/:id`, `article/:slug/:commentId?`, `promo/:code(A|B)`, `*`. */
  path?: string;
  /** When `true`, the parent screens' paths are not prefixed to this one. */
  exact?: boolean;
  parse?: ReactNavigationParseConfig;
  stringify?: ReactNavigationStringifyConfig;
  /** Extra patterns that match this screen on incoming URLs (React Navigation 7+). */
  alias?: readonly ReactNavigationAlias[];
  initialRouteName?: string;
  /** Nested navigator screens. */
  screens?: ReactNavigationScreensMap;
}

/** A screen's linking configuration: a path string shorthand or the object form. */
export type ReactNavigationScreenConfig = string | ReactNavigationPathConfig;

/** The `screens` map of a navigator, keyed by screen name. */
export type ReactNavigationScreensMap = Record<string, ReactNavigationScreenConfig>;

/** The `config` object inside `LinkingOptions` (may also be passed to the adapter bare). */
export interface ReactNavigationLinkingConfig {
  /** Static prefix path required before every pattern; may not contain params. */
  path?: string;
  initialRouteName?: string;
  screens?: ReactNavigationScreensMap;
}

/** The shape of React Navigation's `LinkingOptions` that this adapter consumes. */
export interface ReactNavigationLinkingOptions {
  /** URL prefixes the app handles, e.g. `myapp://` or `https://example.com`. */
  prefixes?: readonly string[];
  config?: ReactNavigationLinkingConfig;
}
