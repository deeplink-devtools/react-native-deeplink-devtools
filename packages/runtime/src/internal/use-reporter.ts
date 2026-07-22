import { useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import type { DeepLinkReporter, DeepLinkReporterOptions } from '../types.js';
import { createReporterImpl } from './client.js';
import { createSettleTracker, type SettleTracker } from './settle.js';

/**
 * Matched navigation state sampled at the moment a report is emitted.
 */
export interface MatchedState {
  matchedRoute: string | null;
  params: Record<string, unknown>;
}

/**
 * Shared reporter hook: owns the transport client and the Linking listeners;
 * the router entry points supply how to read the currently matched route.
 *
 * `getMatched` is re-read on every render into a ref, so the report emitted
 * after the settle window reflects the router's final state. `stateKey` must
 * change whenever the navigation state does - each change while a URL is
 * pending restarts a short settle timer, and the report fires when the state
 * stops moving. The settle timing itself lives in {@link createSettleTracker}
 * (unit-tested with fake timers).
 */
export function useReporterCore(
  options: DeepLinkReporterOptions,
  router: string,
  getMatched: () => MatchedState,
  stateKey: string,
): void {
  const matchedRef = useRef<MatchedState>({ matchedRoute: null, params: {} });
  try {
    matchedRef.current = getMatched();
  } catch {
    // Never let a router-state read break the app's render.
  }

  const reporterRef = useRef<DeepLinkReporter | null>(null);
  const trackerRef = useRef<SettleTracker | null>(null);

  useEffect(() => {
    reporterRef.current = createReporterImpl({ ...options, router, platform: Platform.OS });
    const tracker = createSettleTracker((pending) => {
      const matched = matchedRef.current;
      reporterRef.current?.report({
        url: pending.url,
        matchedRoute: matched.matchedRoute,
        params: matched.params,
        ts: pending.ts,
      });
    });
    trackerRef.current = tracker;

    let disposed = false;
    let subscription: { remove(): void } | undefined;
    try {
      subscription = Linking.addEventListener('url', (event) => {
        if (!disposed) {
          tracker.capture(event.url, Date.now());
        }
      });
    } catch {
      // Linking unavailable (bare test env) - the reporter stays silent.
    }
    try {
      Linking.getInitialURL()
        .then((url) => {
          if (!disposed && typeof url === 'string' && url.length > 0) {
            tracker.capture(url, Date.now());
          }
        })
        .catch(() => undefined);
    } catch {
      // Same: silence over noise.
    }
    return () => {
      disposed = true;
      try {
        subscription?.remove();
      } catch {
        // Subscription already torn down.
      }
      tracker.dispose();
      trackerRef.current = null;
      reporterRef.current?.close();
      reporterRef.current = null;
    };
    // Mount-once by design: transport options are fixed for the app's lifetime.
  }, []);

  useEffect(() => {
    trackerRef.current?.stateChanged();
    // Reacts to navigation-state movement only.
  }, [stateKey]);
}
