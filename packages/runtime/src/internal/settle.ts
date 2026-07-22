/** A URL waiting for navigation to settle before it is reported. */
export interface PendingUrl {
  url: string;
  /** Capture time, in milliseconds since the Unix epoch. */
  ts: number;
}

/**
 * The settle state machine extracted from the reporter hook so its timing is
 * unit-testable with fake timers. One URL is pending at a time; it is emitted
 * once navigation stops moving.
 */
export interface SettleTracker {
  /** A URL arrived. Any URL still pending is emitted as-is first. */
  capture(url: string, ts: number): void;
  /** Navigation state moved; restarts the (shorter) settle window when a URL is pending. */
  stateChanged(): void;
  /** Cancel the timer and drop any pending URL without emitting it. */
  dispose(): void;
}

/** Timing knobs, injectable for tests; defaults match the reporter's behavior. */
export interface SettleTrackerOptions {
  /** Wait after a URL arrives when no navigation movement is observed at all. */
  settleAfterUrlMs?: number;
  /** Debounce after each observed navigation-state change while a URL is pending. */
  settleAfterStateChangeMs?: number;
}

/**
 * How long after a URL arrives the reporter waits for navigation to settle
 * before emitting, when no state change is observed at all.
 */
export const SETTLE_AFTER_URL_MS = 500;

/**
 * Debounce after each observed navigation-state change while a URL is
 * pending - coalesces multi-step transitions (nested navigators mount one
 * level at a time) into one report of the final state.
 */
export const SETTLE_AFTER_STATE_CHANGE_MS = 150;

/**
 * Create a {@link SettleTracker} that calls `emit` with the pending URL once
 * navigation has settled. `emit` reads whatever routing state it needs at
 * call time, which is the point: the report reflects the router's final state,
 * not the state when the URL arrived.
 */
export function createSettleTracker(
  emit: (pending: PendingUrl) => void,
  options: SettleTrackerOptions = {},
): SettleTracker {
  const settleAfterUrlMs = options.settleAfterUrlMs ?? SETTLE_AFTER_URL_MS;
  const settleAfterStateChangeMs = options.settleAfterStateChangeMs ?? SETTLE_AFTER_STATE_CHANGE_MS;

  let pending: PendingUrl | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flush = (): void => {
    if (pending === null) {
      return;
    }
    const flushed = pending;
    pending = null;
    clearTimer();
    emit(flushed);
  };

  const restart = (ms: number): void => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, ms);
  };

  return {
    capture(url, ts): void {
      flush();
      pending = { url, ts };
      restart(settleAfterUrlMs);
    },
    stateChanged(): void {
      if (pending !== null) {
        restart(settleAfterStateChangeMs);
      }
    },
    dispose(): void {
      clearTimer();
      pending = null;
    },
  };
}
