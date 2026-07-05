/**
 * Rewrites incoming native deep links before the router handles them.
 * https://docs.expo.dev/router/advanced/native-intent/
 */
export function redirectSystemPath({ path }: { path: string | null; initial: boolean }) {
  // Example rewrite: legacy short links /u/:id -> /users/:id
  if (path?.startsWith('/u/')) {
    return path.replace('/u/', '/users/');
  }
  return path;
}
