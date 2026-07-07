/**
 * Convert Expo Router file segments (as returned by `useSegments()`, e.g.
 * `['(tabs)', 'users', '[id]']`) into a route-table pattern (`/users/:id`),
 * matching the patterns `rndl routes` derives so the CLI can compare them:
 * `(group)` segments carry no URL presence and are dropped, `[param]` becomes
 * `:param`, and `[...catchAll]` becomes `*catchAll`. No segments means the
 * root index route, `/`.
 */
export function segmentsToPattern(segments: readonly string[]): string {
  const parts: string[] = [];
  for (const segment of segments) {
    if (segment.startsWith('(') && segment.endsWith(')')) {
      continue;
    }
    if (segment.startsWith('[...') && segment.endsWith(']')) {
      parts.push(`*${segment.slice(4, -1)}`);
      continue;
    }
    if (segment.startsWith('[') && segment.endsWith(']')) {
      parts.push(`:${segment.slice(1, -1)}`);
      continue;
    }
    parts.push(segment);
  }
  return `/${parts.join('/')}`;
}
