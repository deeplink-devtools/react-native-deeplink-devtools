import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSettleTracker,
  SETTLE_AFTER_STATE_CHANGE_MS,
  SETTLE_AFTER_URL_MS,
  type PendingUrl,
} from './settle.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createSettleTracker', () => {
  it('emits a captured URL after the settle window when nothing moves', () => {
    const emitted: PendingUrl[] = [];
    const tracker = createSettleTracker((p) => emitted.push(p));

    tracker.capture('myapp://a', 100);
    vi.advanceTimersByTime(SETTLE_AFTER_URL_MS - 1);
    expect(emitted).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(emitted).toEqual([{ url: 'myapp://a', ts: 100 }]);
  });

  it('coalesces multi-step navigation into one report of the final state', () => {
    const emitted: PendingUrl[] = [];
    const tracker = createSettleTracker((p) => emitted.push(p));

    tracker.capture('myapp://deep', 1);
    // Each state change restarts the shorter window; only the final settle emits.
    vi.advanceTimersByTime(100);
    tracker.stateChanged();
    vi.advanceTimersByTime(100);
    tracker.stateChanged();
    vi.advanceTimersByTime(SETTLE_AFTER_STATE_CHANGE_MS - 1);
    expect(emitted).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(emitted).toEqual([{ url: 'myapp://deep', ts: 1 }]);
  });

  it('flushes a still-pending URL immediately when a new one arrives', () => {
    const emitted: PendingUrl[] = [];
    const tracker = createSettleTracker((p) => emitted.push(p));

    tracker.capture('myapp://first', 1);
    tracker.capture('myapp://second', 2);
    // The first is emitted as-is the moment the second is captured.
    expect(emitted).toEqual([{ url: 'myapp://first', ts: 1 }]);
    vi.advanceTimersByTime(SETTLE_AFTER_URL_MS);
    expect(emitted).toEqual([
      { url: 'myapp://first', ts: 1 },
      { url: 'myapp://second', ts: 2 },
    ]);
  });

  it('ignores state changes when no URL is pending', () => {
    const emitted: PendingUrl[] = [];
    const tracker = createSettleTracker((p) => emitted.push(p));

    tracker.stateChanged();
    vi.advanceTimersByTime(10_000);
    expect(emitted).toEqual([]);
  });

  it('does not emit after dispose', () => {
    const emitted: PendingUrl[] = [];
    const tracker = createSettleTracker((p) => emitted.push(p));

    tracker.capture('myapp://a', 1);
    tracker.dispose();
    vi.advanceTimersByTime(10_000);
    expect(emitted).toEqual([]);
  });

  it('honors injected timing overrides', () => {
    const emitted: PendingUrl[] = [];
    const tracker = createSettleTracker((p) => emitted.push(p), { settleAfterUrlMs: 50 });

    tracker.capture('myapp://a', 1);
    vi.advanceTimersByTime(50);
    expect(emitted).toEqual([{ url: 'myapp://a', ts: 1 }]);
  });
});
