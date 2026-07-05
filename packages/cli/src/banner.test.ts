import { describe, expect, it } from 'vitest';
import { banner } from './banner.js';

describe('banner', () => {
  it('includes the package name and version', () => {
    const line = banner('react-native-deeplink-devtools', '0.0.0');
    expect(line).toContain('react-native-deeplink-devtools');
    expect(line).toContain('v0.0.0');
  });
});
