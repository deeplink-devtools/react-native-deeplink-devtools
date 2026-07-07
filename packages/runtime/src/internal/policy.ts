/**
 * Reconnect delay for the 0-based attempt number: 2s, 4s, 8s, then capped at
 * 10s. The CLI not running is the normal case, so the reporter settles into a
 * slow, quiet retry rather than hammering the port.
 */
export function backoffDelayMs(attempt: number): number {
  return Math.min(2000 * 2 ** Math.max(0, attempt), 10_000);
}

/**
 * Append `item`, keeping only the newest `max` items (oldest dropped first).
 * Mutates `items` in place.
 */
export function pushBounded<T>(items: T[], item: T, max: number): void {
  items.push(item);
  while (items.length > max) {
    items.shift();
  }
}
