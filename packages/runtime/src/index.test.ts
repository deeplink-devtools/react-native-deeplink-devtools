import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeepLinkReportEvent } from './index.js';
import { createReporter } from './index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('@deeplink-devtools/runtime', () => {
  it('models the reporter event payload', () => {
    const event: DeepLinkReportEvent = {
      url: 'https://example.com/users/42',
      matchedRoute: 'users/[id]',
      params: { id: '42' },
      ts: Date.now(),
    };
    expect(event.matchedRoute).toBe('users/[id]');
  });

  it('createReporter is inert when __DEV__ is false (production)', () => {
    vi.stubGlobal('__DEV__', false);
    const reporter = createReporter({ router: 'custom' });
    expect(() => {
      reporter.report({ url: 'x://y', matchedRoute: null, params: {}, ts: 1 });
      reporter.close();
    }).not.toThrow();
  });

  // The __DEV__-true path lazy-requires the built implementation from dist/,
  // so it cannot run against .ts sources here; the client behind the gate is
  // covered directly in internal/client.test.ts, and the wired-up hook is
  // exercised by the live end-to-end lanes in docs/test-matrix.md.
});
