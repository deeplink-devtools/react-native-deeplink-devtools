import { describe, expect, it } from 'vitest';
import { segmentsToPattern } from './segments.js';

describe('segmentsToPattern', () => {
  it('joins plain segments into a path', () => {
    expect(segmentsToPattern(['settings', 'profile'])).toBe('/settings/profile');
  });

  it('maps no segments to the root index route', () => {
    expect(segmentsToPattern([])).toBe('/');
  });

  it('strips group segments', () => {
    expect(segmentsToPattern(['(tabs)', 'users', '[id]'])).toBe('/users/:id');
    expect(segmentsToPattern(['(auth)'])).toBe('/');
  });

  it('converts params and catch-alls to route-table syntax', () => {
    expect(segmentsToPattern(['users', '[id]'])).toBe('/users/:id');
    expect(segmentsToPattern(['docs', '[...slug]'])).toBe('/docs/*slug');
  });

  it('leaves unknown conventions untouched', () => {
    expect(segmentsToPattern(['+not-found'])).toBe('/+not-found');
  });
});
