import { describe, expect, it } from 'vitest';
import type { DeepLinkReportEvent } from './index.js';

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
});
