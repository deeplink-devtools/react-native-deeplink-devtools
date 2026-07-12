import type { FetchedDocument } from '@deeplink-devtools/core';

/** Default body-size cap: Apple's 128KB AASA limit plus a little slack to detect overflow. */
const DEFAULT_MAX_BYTES = 256 * 1024;

/**
 * Fetch a single URL into a {@link FetchedDocument}, without following
 * redirects (so the AASA no-redirect rule can be enforced) and capping the
 * body so a hostile or misconfigured server cannot exhaust memory. Never
 * throws: transport failures are captured in `networkError`.
 */
export async function fetchWellKnown(
  url: string,
  opts: { maxBytes?: number } = {},
): Promise<FetchedDocument> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const scheme = safeScheme(url);

  let response: Response;
  try {
    response = await fetch(url, { redirect: 'manual', headers: { accept: 'application/json' } });
  } catch (error) {
    return {
      requestedUrl: url,
      finalUrl: url,
      scheme,
      ok: false,
      status: 0,
      redirected: false,
      byteLength: 0,
      truncated: false,
      body: '',
      networkError: error instanceof Error ? error.message : String(error),
    };
  }

  const redirected = response.status >= 300 && response.status < 400;
  const redirectLocation = response.headers.get('location') ?? undefined;
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  const finalUrl = response.url !== '' ? response.url : url;

  const { body, byteLength, truncated } = await readCappedBody(response, maxBytes);

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
