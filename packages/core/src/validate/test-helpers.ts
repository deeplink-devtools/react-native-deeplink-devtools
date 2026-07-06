import type { FetchedDocument } from './types.js';

/**
 * Build a {@link FetchedDocument} for tests: a healthy HTTPS 200 JSON response
 * by default, with any field overridable. `body` may be passed as an object
 * (JSON-stringified) or a raw string (for malformed-JSON cases).
 */
export function doc(body: unknown, overrides: Partial<FetchedDocument> = {}): FetchedDocument {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const base: FetchedDocument = {
    requestedUrl: 'https://example.com/.well-known/apple-app-site-association',
    finalUrl: 'https://example.com/.well-known/apple-app-site-association',
    scheme: 'https',
    ok: true,
    status: 200,
    redirected: false,
    contentType: 'application/json',
    byteLength: Buffer.byteLength(text),
    truncated: false,
    body: text,
  };
  return { ...base, ...overrides };
}
