import { describe, expect, it } from 'vitest';
import { backoffDelayMs, pushBounded } from './policy.js';

describe('backoffDelayMs', () => {
  it('doubles from 2s and caps at 10s', () => {
    expect(backoffDelayMs(0)).toBe(2000);
    expect(backoffDelayMs(1)).toBe(4000);
    expect(backoffDelayMs(2)).toBe(8000);
    expect(backoffDelayMs(3)).toBe(10_000);
    expect(backoffDelayMs(50)).toBe(10_000);
  });

  it('treats a negative attempt as the first', () => {
    expect(backoffDelayMs(-1)).toBe(2000);
  });
});

describe('pushBounded', () => {
  it('appends within the cap', () => {
    const items = [1, 2];
    pushBounded(items, 3, 5);
    expect(items).toEqual([1, 2, 3]);
  });

  it('drops the oldest items beyond the cap', () => {
    const items = [1, 2, 3];
    pushBounded(items, 4, 3);
    expect(items).toEqual([2, 3, 4]);
  });
});
