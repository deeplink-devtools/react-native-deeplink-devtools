import type { FetchedDocument } from '@deeplink-devtools/core';

/** Default body-size cap: Apple's 128KB AASA limit plus a little slack to detect overflow. */
const DEFAULT_MAX_BYTES = 256 * 1024;

/** Default whole-request deadline; a stalling server must not hang `rndl validate` (or CI). */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Human message for a fetch failure; abort-by-deadline gets an actionable text. */
function describeNetworkError(error: unknown, timeoutMs: number): string {
  const isTimeout = (value: unknown): boolean =>
    value instanceof Error && (value.name === 'TimeoutError' || value.name === 'AbortError');
  if (isTimeout(error) || (error instanceof Error && isTimeout(error.cause))) {
    return `the server did not respond within ${Math.round(timeoutMs / 1000)}s`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Fetch a single URL into a {@link FetchedDocument}, without following
 * redirects (so the AASA no-redirect rule can be enforced), capping the
 * body so a hostile or misconfigured server cannot exhaust memory, and
 * aborting after `timeoutMs` so a stalling server cannot hang the run. Never
 * throws: transport failures are captured in `networkError`.
 */
export async function fetchWellKnown(
  url: string,
  opts: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<FetchedDocument> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const scheme = safeScheme(url);
  const failure = (error: unknown): FetchedDocument => ({
    requestedUrl: url,
    finalUrl: url,
    scheme,
    ok: false,
    status: 0,
    redirected: false,
    byteLength: 0,
    truncated: false,
    body: '',
    networkError: describeNetworkError(error, timeoutMs),
  });

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: 'manual',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return failure(error);
  }

  const redirected = response.status >= 300 && response.status < 400;
  const redirectLocation = response.headers.get('location') ?? undefined;
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  const finalUrl = response.url !== '' ? response.url : url;

  // The deadline also covers the body: a server that sends headers and then
  // stalls mid-stream aborts the read, which must surface as a network error,
  // not an exception.
  let read: { body: string; byteLength: number; truncated: boolean };
  try {
    read = await readCappedBody(response, maxBytes);
  } catch (error) {
    return failure(error);
  }
  const { body, byteLength, truncated } = read;

  return {
    requestedUrl: url,
    finalUrl,
    scheme: safeScheme(finalUrl) || scheme,
    ok: response.ok,
    status: response.status,
    redirected,
    ...(redirectLocation !== undefined ? { redirectLocation } : {}),
    ...(contentType !== undefined ? { contentType } : {}),
    byteLength,
    truncated,
    body,
  };
}

/** Read a response body up to `maxBytes`, flagging truncation without buffering more. */
async function readCappedBody(
  response: Response,
  maxBytes: number,
): Promise<{ body: string; byteLength: number; truncated: boolean }> {
  if (response.body === null) {
    const text = await response.text();
    const byteLength = Buffer.byteLength(text);
    return { body: text, byteLength, truncated: false };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return { body: Buffer.concat(chunks).toString('utf8'), byteLength, truncated };
}

/** Extract the lowercased URL scheme, or '' if the URL is unparseable. */
function safeScheme(url: string): string {
  try {
    return new URL(url).protocol.replace(/:$/, '').toLowerCase();
  } catch {
    return '';
  }
}

/** Normalize a user-supplied `--domain` into a bare host (strip scheme, path, trailing slash). */
export function normalizeDomain(domain: string): string {
  return domain
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .trim();
}

/**
 * Fetch the AASA for a domain, trying the `.well-known` path first and falling
 * back to the root path (both are locations Apple has honored historically).
 */
export async function fetchAasa(domain: string): Promise<FetchedDocument> {
  const wellKnown = await fetchWellKnown(
    `https://${domain}/.well-known/apple-app-site-association`,
  );
  // Fall back to the root path only on a clean 404-style miss - a redirect or
  // transport error would recur there, and the well-known result is the honest
  // one to report.
  if (wellKnown.ok || wellKnown.redirected || wellKnown.networkError !== undefined) {
    return wellKnown;
  }
  const root = await fetchWellKnown(`https://${domain}/apple-app-site-association`);
  return root.ok ? root : wellKnown;
}

/** Fetch the assetlinks.json for a domain from its `.well-known` path. */
export async function fetchAssetlinks(domain: string): Promise<FetchedDocument> {
  return fetchWellKnown(`https://${domain}/.well-known/assetlinks.json`);
}
