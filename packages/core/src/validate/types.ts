import type { Diagnostic, RouteTable } from '../index.js';

/**
 * A `.well-known` document after it has been fetched, normalized into the flat
 * shape the pure validators consume. Producing this is the CLI's job (network
 * I/O); everything downstream is a pure function of these fields, so the
 * validators are testable without a network.
 */
export interface FetchedDocument {
  /** The URL the fetch was aimed at. */
  requestedUrl: string;
  /** The URL that actually served the body (differs from `requestedUrl` on a fallback). */
  finalUrl: string;
  /** URL scheme of `finalUrl`, lowercased, e.g. `https`. */
  scheme: string;
  /** Whether a body was retrieved with a 2xx status. */
  ok: boolean;
  /** HTTP status code; `0` when the request never completed (see `networkError`). */
  status: number;
  /** Whether the server answered with a 3xx redirect (fetched with `redirect: 'manual'`). */
  redirected: boolean;
  /** The `Location` header of a redirect, when present. */
  redirectLocation?: string;
  /** The response `Content-Type` header, lowercased and without parameters, when present. */
  contentType?: string;
  /** Size of the retrieved body in bytes. */
  byteLength: number;
  /** Whether the body was cut off at the fetcher's size cap (body is incomplete). */
  truncated: boolean;
  /** The retrieved body as text (possibly empty on error). */
  body: string;
  /** A transport-level failure message (DNS, connection refused, timeout), when the request threw. */
  networkError?: string;
}

/** One entry of an AASA `applinks.details[].components[]` array (iOS 13+). */
export interface AasaComponent {
  /** Path pattern with `*` (any substring) and `?` (single char) wildcards. */
  '/'?: string;
  /** Query-parameter constraints. */
  '?'?: string | Record<string, string>;
  /** URL-fragment constraint. */
  '#'?: string;
  /** When `true`, URLs matching this component are NOT handled as universal links. */
  exclude?: boolean;
  /** Free-text annotation. */
  comment?: string;
  /** Whether path matching is case-sensitive (default: case-insensitive). */
  caseSensitive?: boolean;
  /** Whether the pattern is already percent-encoded. */
  percentEncoded?: boolean;
}

/** One entry of an AASA `applinks.details[]` array. */
export interface AppLinksDetail {
  /** Single app identifier, `<TEAMID>.<BUNDLEID>` (pre-iOS-13 style). */
  appID?: string;
  /** App identifiers, `<TEAMID>.<BUNDLEID>` each (iOS 13+). */
  appIDs?: string[];
  /** iOS 13+ URL-matching components. */
  components?: AasaComponent[];
  /** Legacy (pre-iOS-13) path patterns, e.g. `['/buy/*', 'NOT /admin/*']`. */
  paths?: string[];
}

/** The parsed contents of an apple-app-site-association file (only the parts rndl reads). */
export interface AasaFile {
  applinks?: {
    apps?: string[];
    details?: AppLinksDetail[];
  };
}

/** One statement of an assetlinks.json Digital Asset Links file. */
export interface AssetlinksStatement {
  relation?: string[];
  target?: {
    namespace?: string;
    package_name?: string;
    sha256_cert_fingerprints?: string[];
  };
}

/** The result of validating one fetched `.well-known` document. */
export interface DocumentReport {
  /** The URL rndl aimed at (the `.well-known` path). */
  requestedUrl: string;
  /** The URL that actually served the validated body, when one did. */
  fetchedFrom?: string;
  /** Findings for this document. */
  diagnostics: Diagnostic[];
  /** Informational remarks that are neither errors nor warnings. */
  notes: string[];
}

/** The AASA half of a {@link ValidationResult}. */
export interface AasaReport extends DocumentReport {
  /** The parsed file, when the body was valid JSON. */
  parsed?: AasaFile;
}

/** The assetlinks half of a {@link ValidationResult}. */
export interface AssetlinksReport extends DocumentReport {
  /** The parsed statements, when the body was a valid JSON array. */
  parsed?: AssetlinksStatement[];
}

/**
 * Everything `rndl validate` learned about a domain. `diagnostics` and `notes`
 * aggregate both sub-reports so the CLI can derive its exit code and render
 * without knowing about AASA vs assetlinks.
 */
export interface ValidationResult {
  domain: string;
  aasa: AasaReport;
  assetlinks: AssetlinksReport;
  /** Every finding from both documents (for exit-code and rendering). */
  diagnostics: Diagnostic[];
  /** Every informational note from both documents. */
  notes: string[];
}

/** Options for {@link validateAasa}. */
export interface ValidateAasaOptions {
  /** When provided, cross-check the route table against the AASA components. */
  table?: RouteTable;
}

/** Options for {@link validateAssetlinks}. */
export interface ValidateAssetlinksOptions {
  /** Expected Android package name; a mismatch is an error. */
  packageName?: string;
  /** Expected SHA-256 signing-cert fingerprint; compared case-insensitively. */
  sha256?: string;
}
