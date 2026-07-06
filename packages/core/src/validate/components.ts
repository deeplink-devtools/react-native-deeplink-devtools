import type { Route } from '../index.js';

/** Escape a string for literal use inside a RegExp, leaving `*`/`?` for the caller. */
function escapeRegexLiteral(text: string): string {
  return text.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match a URL path against an AASA path-component pattern, mirroring Apple's
 * matching: `*` matches any run of characters, `?` matches exactly one, and
 * matching is case-insensitive unless `caseSensitive` is set. Everything else
 * is literal. The pattern is anchored to the full path.
 */
export function matchAasaComponentPath(
  pattern: string,
  path: string,
  opts: { caseSensitive?: boolean } = {},
): boolean {
  const regexBody = pattern
    .split('')
    .map((char) => (char === '*' ? '.*' : char === '?' ? '.' : escapeRegexLiteral(char)))
    .join('');
  const flags = opts.caseSensitive === true ? '' : 'i';
  return new RegExp(`^${regexBody}$`, flags).test(path);
}

/** Placeholder segment substituted for a single dynamic param when deriving an example path. */
const PARAM_PLACEHOLDER = 'x';
/** Placeholder substituted for a catch-all: multiple segments, to exercise `*` components. */
const CATCH_ALL_PLACEHOLDER = 'x/y';

/**
 * Turn a route pattern into a representative concrete path so it can be tested
 * against AASA components. `:id` → a single segment, `*slug`/catch-all → two
 * segments, static segments are kept, and any query string is dropped. E.g.
 * `/users/:id` → `/users/x`, `/posts/*slug` → `/posts/x/y`, `/` → `/`.
 */
export function routePatternToExamplePath(route: Route): string {
  const pathOnly = route.pattern.split('?')[0] ?? route.pattern;
  const segments = pathOnly.split('/').map((segment) => {
    if (segment.startsWith('*') || segment.includes('...')) {
      return CATCH_ALL_PLACEHOLDER;
    }
    if (segment.startsWith(':') || (segment.startsWith('[') && segment.endsWith(']'))) {
      return PARAM_PLACEHOLDER;
    }
    return segment;
  });
  const joined = segments.join('/');
  return joined === '' ? '/' : joined;
}
