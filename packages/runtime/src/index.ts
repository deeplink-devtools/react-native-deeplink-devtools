import type { DeepLinkReportEvent } from '@deeplink-devtools/core';
import type { CreateReporterOptions, DeepLinkReporter } from './types.js';

export type { DeepLinkReportEvent };
export type {
  CreateReporterOptions,
  DeepLinkReporter,
  DeepLinkReporterOptions,
  ReporterNavigationRef,
} from './types.js';

/**
 * Create a low-level deep-link reporter for a custom router integration.
 * Most apps should use the ready-made hooks instead:
 * `@deeplink-devtools/runtime/expo-router` or
 * `@deeplink-devtools/runtime/react-navigation`.
 *
 * Development-only: in production builds this returns an inert reporter and
 * the transport implementation is not even part of the bundle.
 */
export function createReporter(options: CreateReporterOptions = {}): DeepLinkReporter {
  if (__DEV__) {
    type Impl = { createReporterImpl: (options?: CreateReporterOptions) => DeepLinkReporter };
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy dev-only require: Metro production builds constant-fold __DEV__ and drop this branch (and the module behind it) from app bundles.
    const impl = require('./internal/client.js') as Impl;
    return impl.createReporterImpl(options);
  }
  return { report: () => undefined, close: () => undefined };
}
