/**
 * Type-level test for the generated deep-link types (React Navigation). Checked
 * by `tsc -p tsconfig.typecheck.json` in CI: the `@ts-expect-error` lines assert
 * that wrong usage is rejected, so if the generated types ever stop catching a
 * bad param the unused directive makes `tsc` fail.
 */
import { buildDeepLink, useTypedParams } from './deeplinks.gen';

// Correct usage compiles. commentId is optional, so it can be omitted.
export const articleLink = buildDeepLink('/feed/article/:slug/:commentId?', { slug: 'hello' });
export const userLink = buildDeepLink('/user/:id', { id: '42' });
export const promoLink = buildDeepLink('/promo/:code(SUMMER|WINTER)', { code: 'SUMMER' });

// @ts-expect-error - a param value must be a string, not a number.
buildDeepLink('/user/:id', { id: 42 });

// @ts-expect-error - unknown route key.
buildDeepLink('/nope', {});

// Reading params: a custom-parse param is typed unknown; a plain path param is a string.
export function readParams(): { slug: string; commentId: unknown } {
  const { slug, commentId } = useTypedParams<'/feed/article/:slug/:commentId?'>();
  return { slug, commentId };
}
