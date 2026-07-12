import type { DeepLinkReporterOptions, ReporterNavigationRef } from '../types.js';

export type { DeepLinkReporterOptions, ReporterNavigationRef } from '../types.js';

/**
 * Options for the React Navigation reporter: the shared transport options
 * plus the container ref to observe.
 */
export interface ReactNavigationReporterOptions extends DeepLinkReporterOptions {
  /** The app's navigation container ref (`createNavigationContainerRef()`). */
  navigationRef: ReporterNavigationRef;
}

/**
 * Report every deep link this app receives to a running `rndl interactive`
 * session - React Navigation edition. Call it once next to your
 * `NavigationContainer`, passing the container ref:
 *
 * ```tsx App.tsx
 * import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
 * import { useDeepLinkReporter } from '@deeplink-devtools/runtime/react-navigation';
 *
 * const navigationRef = createNavigationContainerRef();
 *
 * export default function App() {
 *   useDeepLinkReporter({ navigationRef });
 *   return <NavigationContainer ref={navigationRef} linking={linking}>…</NavigationContainer>;
 * }
 * ```
 *
 * Development-only: in production builds the hook is an inert no-op and the
 * reporter implementation is excluded from the bundle entirely.
 */
export function useDeepLinkReporter(options: ReactNavigationReporterOptions): void {
  if (__DEV__) {
    // Calling a hook behind this condition is safe: __DEV__ is a build-time
    // constant, so the branch can never change between renders.
    type Impl = { useDeepLinkReporterImpl: (options: ReactNavigationReporterOptions) => void };
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy dev-only require: Metro production builds constant-fold __DEV__ and drop this branch, keeping the implementation out of the bundle.
    const impl = require('./impl.js') as Impl;
    impl.useDeepLinkReporterImpl(options);
  }
}
