import type { DeepLinkReporterOptions } from '../types.js';

export type { DeepLinkReporterOptions } from '../types.js';

/**
 * Report every deep link this app receives to a running `rndl interactive`
 * session - Expo Router edition. Call it once from the root layout:
 *
 * ```tsx app/_layout.tsx
 * import { useDeepLinkReporter } from '@deeplink-devtools/runtime/expo-router';
 *
 * export default function RootLayout() {
 *   useDeepLinkReporter();
 *   return <Stack />;
 * }
 * ```
 *
 * Development-only: in production builds the hook is an inert no-op and the
 * reporter implementation is excluded from the bundle entirely.
 */
export function useDeepLinkReporter(options: DeepLinkReporterOptions = {}): void {
  if (__DEV__) {
    // Calling a hook behind this condition is safe: __DEV__ is a build-time
    // constant, so the branch can never change between renders.
    type Impl = { useDeepLinkReporterImpl: (options?: DeepLinkReporterOptions) => void };
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy dev-only require: Metro production builds constant-fold __DEV__ and drop this branch, keeping the implementation (and expo-router) out of the bundle.
    const impl = require('./impl.js') as Impl;
    impl.useDeepLinkReporterImpl(options);
  }
}
