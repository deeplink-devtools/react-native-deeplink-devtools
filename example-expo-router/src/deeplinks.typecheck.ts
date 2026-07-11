/**
 * Type-level test for the generated deep-link types (Expo Router). This file is
 * checked by `tsc -p tsconfig.typecheck.json` in CI: the `@ts-expect-error`
 * lines assert that wrong usage is rejected, so if the generated types ever stop
 * catching a bad param, the unused directive makes `tsc` fail.
 */
import { buildDeepLink, useTypedParams } from './deeplinks.gen';

// Correct usage compiles.
export const userLink = buildDeepLink('/users/[id]', { id: '42' });
export const docsLink = buildDeepLink('/docs/[page]', { page: 'intro' });
export const staticLink = buildDeepLink('/about', {});
export const catchAllLink = buildDeepLink('/posts/[...slug]', { slug: 'a/b/c' });

// @ts-expect-error - a param value must be a string, not a number.
buildDeepLink('/users/[id]', { id: 42 });

// @ts-expect-error - unknown route key.
buildDeepLink('/does/not/exist', {});

// @ts-expect-error - missing the required id param.
buildDeepLink('/users/[id]', {});

// Reading params: types reflect what Expo Router returns.
export function readParams(): { id: string; slug: string[] } {
  const { id } = useTypedParams<'/users/[id]'>();
  const { slug } = useTypedParams<'/posts/[...slug]'>();
  return { id, slug };
}
