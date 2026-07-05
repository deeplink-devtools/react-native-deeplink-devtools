/**
 * Server middleware (root-level only). Runs before every request when the app
 * is served with server output. Requires `unstable_useServerMiddleware: true`
 * in the expo-router plugin config (see app.json).
 */
export default function middleware(request: Request) {
  console.log(`[middleware] ${request.method} ${request.url}`);
}
