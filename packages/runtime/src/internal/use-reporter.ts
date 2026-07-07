import { useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import type { DeepLinkReporter, DeepLinkReporterOptions } from '../types.js';
import { createReporterImpl } from './client.js';

/**
 * Matched navigation state sampled at the moment a report is emitted.
 */
export interface MatchedState {
  matchedRoute: string | null;
  params: Record<string, unknown>;
}

/**
 * How long after a URL arrives the reporter waits for navigation to settle
 * before emitting, when no state change is observed at all.
 */
const SETTLE_AFTER_URL_MS = 500;

/**
 * Debounce after each observed navigation-state change while a URL is
 * pending — coalesces multi-step transitions (nested navigators mount one
 * level at a time) into one report of the final state.
 */
const SETTLE_AFTER_STATE_CHANGE_MS = 150;

/**
 * Shared reporter hook: owns the transport client and the Linking listeners;
 * the router entry points supply how to read the currently matched route.
 *
 * `getMatched` is re-read on every render into a ref, so the report emitted
 * after the settle window reflects the router's final state. `stateKey` must
 * change whenever the navigation state does — each change while a URL is
 * pending restarts a short settle timer, and the report fires when the state
 * stops moving.
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
  const pendingRef = useRef<{ url: string; ts: number } | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushRef = useRef<() => void>(() => undefined);
  flushRef.current = () => {
    const pending = pendingRef.current;
    if (pending === null) {
      return;
    }
    pendingRef.current = null;
    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    const matched = matchedRef.current;
    reporterRef.current?.report({
      url: pending.url,
      matchedRoute: matched.matchedRoute,
      params: matched.params,
      ts: pending.ts,
    });
  };

  const restartSettleRef = useRef<(ms: number) => void>(() => undefined);
  restartSettleRef.current = (ms: number) => {
    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current);
    }
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      flushRef.current();
    }, ms);
  };

  const captureRef = useRef<(url: string) => void>(() => undefined);
  captureRef.current = (url: string) => {
    // A URL still pending from before is settled as-is first.
    flushRef.current();
    pendingRef.current = { url, ts: Date.now() };
    restartSettleRef.current(SETTLE_AFTER_URL_MS);
  };

  useEffect(() => {
    reporterRef.current = createReporterImpl({ ...options, router, platform: Platform.OS });
    let disposed = false;
    let subscription: { remove(): void } | undefined;
    try {
      subscription = Linking.addEventListener('url', (event) => {
        if (!disposed) {
          captureRef.current(event.url);
        }
      });
    } catch {
      // Linking unavailable (bare test env) — the reporter stays silent.
    }
    try {
      Linking.getInitialURL()
        .then((url) => {
          if (!disposed && typeof url === 'string' && url.length > 0) {
            captureRef.current(url);
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
      if (settleTimerRef.current !== null) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      pendingRef.current = null;
      reporterRef.current?.close();
      reporterRef.current = null;
    };
    // Mount-once by design: transport options are fixed for the app's lifetime.
  }, []);

  useEffect(() => {
    if (pendingRef.current !== null) {
      restartSettleRef.current(SETTLE_AFTER_STATE_CHANGE_MS);
    }
    // Reacts to navigation-state movement only.
  }, [stateKey]);
}
