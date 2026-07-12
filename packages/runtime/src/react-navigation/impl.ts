import { useEffect, useState } from 'react';
import { useReporterCore } from '../internal/use-reporter.js';
import type { MatchedState } from '../internal/use-reporter.js';
import type { ReactNavigationReporterOptions } from './index.js';

/**
 * Development implementation behind the React Navigation
 * `useDeepLinkReporter` gate: observes the container ref's state events and
 * reads the focused route from `getCurrentRoute()`.
 */
export function useDeepLinkReporterImpl(options: ReactNavigationReporterOptions): void {
  const { navigationRef, ...transport } = options;

  // Bumped on every navigation-state event so useReporterCore sees movement.
  const [stateTick, setStateTick] = useState(0);
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = navigationRef.addListener('state', () => setStateTick((tick) => tick + 1));
    } catch {
      // Ref not ready to listen - reports fall back to the settle timeout.
    }
    return () => {
      try {
        unsubscribe?.();
      } catch {
        // Container already unmounted.
      }
    };
  }, [navigationRef]);

  useReporterCore(
    transport,
    'react-navigation',
    (): MatchedState => {
      let route: { name: string; params?: object } | undefined;
      try {
        route = navigationRef.isReady() ? navigationRef.getCurrentRoute() : undefined;
      } catch {
        route = undefined;
      }
      return route === undefined
        ? { matchedRoute: null, params: {} }
        : {
            matchedRoute: route.name,
            params: { ...(route.params ?? {}) } as Record<string, unknown>,
          };
    },
    String(stateTick),
  );
}
