import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildTypegen } from './typegen.js';

const EXPO_ROOT = fileURLToPath(new URL('../../../../example-expo-router', import.meta.url));
const RNAV_ROOT = fileURLToPath(new URL('../../../../example-react-navigation', import.meta.url));

describe('buildTypegen', () => {
  it('generates bracket-keyed types + baked scheme for the Expo Router example', async () => {
    const result = await buildTypegen(EXPO_ROOT, { appDir: 'src/app' });
    expect(result.exitCode).toBe(0);
    expect(result.diagnostics).toEqual([]);
    expect(result.routeCount).toBeGreaterThan(0);
    expect(result.prefix).toContain('exampleexporouter');

    const content = result.content ?? '';
    expect(content).toContain("import { useLocalSearchParams } from 'expo-router';");
    expect(content).toContain('"/users/[id]":');
    expect(content).toContain('"/posts/[...slug]":');
    expect(content).toContain('export function buildDeepLink<R extends keyof DeepLinkRoutes>(');
    expect(content).toContain('const DEFAULT_PREFIX = "exampleexporouter://";');
  });

  it('generates colon-keyed types + unknown custom-parse params for React Navigation', async () => {
    const result = await buildTypegen(RNAV_ROOT, {
      config: 'src/navigation/linking.ts#linking',
    });
    expect(result.exitCode).toBe(0);
    expect(result.prefix).toContain('examplereactnavigation');

    const content = result.content ?? '';
    expect(content).toContain("import { useRoute } from '@react-navigation/native';");
    expect(content).toContain('"/user/:id":');
    // Profile.id and Article.commentId use a custom parse -> unknown when read.
    expect(content).toMatch(/"\/user\/:id": \{ id: unknown \};/);
  });

  it('reports an actionable error (exit 1) when no app source is found', async () => {
    const result = await buildTypegen(join(tmpdir(), 'rndl-typegen-missing'), {});
    expect(result.exitCode).toBe(1);
    expect(result.content).toBeUndefined();
    expect(result.diagnostics.map((d) => d.code)).toContain('APP_DIR_NOT_FOUND');
  });
});
