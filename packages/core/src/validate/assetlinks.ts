import type { Diagnostic } from '../index.js';
import type {
  AssetlinksReport,
  AssetlinksStatement,
  FetchedDocument,
  ValidateAssetlinksOptions,
} from './types.js';

/** The relation that grants Android App Link handling. */
const HANDLE_ALL_URLS = 'delegate_permission/common.handle_all_urls';

/** A SHA-256 fingerprint: 32 uppercase hex byte-pairs joined by colons. */
const FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/** Normalize a fingerprint for comparison: uppercase, colons stripped. */
function normalizeFingerprint(fingerprint: string): string {
  return fingerprint.replace(/:/g, '').toUpperCase();
}

/**
 * Validate a fetched assetlinks.json Digital Asset Links document: HTTPS
 * delivery, JSON array shape, the `handle_all_urls` relation, an `android_app`
 * target, package-name and fingerprint format, and — when `--package` /
 * `--sha256` are supplied — that they are present.
 */
export function validateAssetlinks(
  doc: FetchedDocument,
  opts: ValidateAssetlinksOptions = {},
): AssetlinksReport {
  const diagnostics: Diagnostic[] = [];
  const notes: string[] = [];
  const report: AssetlinksReport = {
    requestedUrl: doc.requestedUrl,
    diagnostics,
    notes,
  };

  if (doc.networkError !== undefined) {
    diagnostics.push({
      severity: 'error',
      code: 'ASSETLINKS_FETCH_FAILED',
      message: `could not fetch ${doc.requestedUrl}: ${doc.networkError}`,
      fix: 'serve a valid assetlinks.json at https://<domain>/.well-known/assetlinks.json (HTTP 200).',
    });
    return report;
  }

  // A redirect is terminal: Android does not follow it during verification, and
  // there is no body to validate.
  if (doc.redirected) {
    diagnostics.push({
      severity: 'error',
      code: 'ASSETLINKS_REDIRECTED',
      message: `${doc.requestedUrl} redirected${doc.redirectLocation !== undefined ? ` to ${doc.redirectLocation}` : ` (HTTP ${doc.status})`}; Android App Links verification does not follow redirects`,
      fix: 'serve the file directly at the .well-known path with a 200 (no 3xx). If your apex redirects to www, validate the final host instead.',
    });
    return report;
  }

  if (!doc.ok) {
    diagnostics.push({
      severity: 'error',
      code: 'ASSETLINKS_FETCH_FAILED',
      message: `${doc.requestedUrl} returned HTTP ${doc.status}`,
      fix: 'serve a valid assetlinks.json at https://<domain>/.well-known/assetlinks.json (HTTP 200).',
    });
    return report;
  }

  report.fetchedFrom = doc.finalUrl;

  if (doc.scheme !== 'https') {
    diagnostics.push({
      severity: 'error',
      code: 'ASSETLINKS_NOT_HTTPS',
      message: `served over ${doc.scheme}; Android verifies assetlinks.json only over HTTPS`,
      fix: 'serve the file over HTTPS with a valid certificate.',
    });
  }

  if (doc.contentType !== undefined && !doc.contentType.includes('application/json')) {
    diagnostics.push({
      severity: 'warn',
      code: 'ASSETLINKS_CONTENT_TYPE',
      message: `served with Content-Type '${doc.contentType}'; Android requires 'application/json'`,
      fix: "serve the file with Content-Type 'application/json'.",
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(doc.body);
  } catch (error) {
    diagnostics.push({
      severity: 'error',
      code: 'ASSETLINKS_INVALID_JSON',
      message: `the body is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      fix: 'serve well-formed JSON.',
    });
    return report;
  }

  if (!Array.isArray(parsed)) {
    diagnostics.push({
      severity: 'error',
      code: 'ASSETLINKS_NOT_ARRAY',
      message: 'the top-level value is not a JSON array of statements',
      fix: 'wrap the statement(s) in an array: [ { "relation": [...], "target": {...} } ].',
    });
    return report;
  }

  const statements = parsed as AssetlinksStatement[];
  report.parsed = statements;

  const androidStatements = statements.filter((s) => s.target?.namespace === 'android_app');
  const handleAllUrls = statements.filter(
    (s) => Array.isArray(s.relation) && s.relation.includes(HANDLE_ALL_URLS),
  );

  if (handleAllUrls.length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'ASSETLINKS_NO_HANDLE_ALL_URLS',
      message: `no statement grants the '${HANDLE_ALL_URLS}' relation; Android App Links will not verify`,
      fix: `add "relation": ["${HANDLE_ALL_URLS}"] to your android_app statement.`,
    });
  }

  if (androidStatements.length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'ASSETLINKS_MISSING_ANDROID_APP',
      message: 'no statement targets an `android_app` namespace',
      fix: 'add a statement with target.namespace "android_app", a package_name, and sha256_cert_fingerprints.',
    });
    return report;
  }

  statements.forEach((statement, index) => {
    if (Array.isArray(statement.relation)) {
      for (const relation of statement.relation) {
        if (typeof relation !== 'string' || !relation.includes('/')) {
          diagnostics.push({
            severity: 'warn',
            code: 'ASSETLINKS_INVALID_RELATION',
            message: `statements[${index}] has an unrecognized relation '${String(relation)}'`,
            fix: `use '${HANDLE_ALL_URLS}'.`,
          });
        }
      }
    }
  });

  androidStatements.forEach((statement, index) =>
    validateAndroidTarget(statement, index, diagnostics),
  );

  if (opts.packageName !== undefined) {
    const match = androidStatements.some((s) => s.target?.package_name === opts.packageName);
    if (!match) {
      diagnostics.push({
        severity: 'error',
        code: 'ASSETLINKS_PACKAGE_MISMATCH',
        message: `no android_app statement declares package_name '${opts.packageName}'`,
        fix: `add a statement for '${opts.packageName}', or check the --package value.`,
      });
    }
  }

  if (opts.sha256 !== undefined) {
    const target = normalizeFingerprint(opts.sha256);
    const relevant =
      opts.packageName !== undefined
        ? androidStatements.filter((s) => s.target?.package_name === opts.packageName)
        : androidStatements;
    const match = relevant.some((s) =>
      (s.target?.sha256_cert_fingerprints ?? []).some((fp) => normalizeFingerprint(fp) === target),
    );
    if (!match) {
      diagnostics.push({
        severity: 'error',
        code: 'ASSETLINKS_FINGERPRINT_MISMATCH',
        message: `the provided SHA-256 fingerprint is not listed${opts.packageName !== undefined ? ` for package '${opts.packageName}'` : ''}`,
        fix: 'add the signing certificate fingerprint to sha256_cert_fingerprints, or check --sha256.',
      });
    }
  }

  return report;
}

/** Validate the package name and fingerprints of one android_app statement. */
function validateAndroidTarget(
  statement: AssetlinksStatement,
  index: number,
  diagnostics: Diagnostic[],
): void {
  const where = `android_app statement ${index}`;
  if (
    typeof statement.target?.package_name !== 'string' ||
    statement.target.package_name.length === 0
  ) {
    diagnostics.push({
      severity: 'warn',
      code: 'ASSETLINKS_PACKAGE_MISSING',
      message: `${where} has no \`package_name\``,
      fix: 'add "package_name": "com.your.app".',
    });
  }

  const fingerprints = statement.target?.sha256_cert_fingerprints;
  if (!Array.isArray(fingerprints) || fingerprints.length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'ASSETLINKS_NO_FINGERPRINTS',
      message: `${where} has no \`sha256_cert_fingerprints\`; App Links cannot verify`,
      fix: 'add your signing certificate SHA-256 fingerprint(s).',
    });
    return;
  }

  for (const fingerprint of fingerprints) {
    if (typeof fingerprint !== 'string' || !FINGERPRINT_RE.test(fingerprint.toUpperCase())) {
      diagnostics.push({
        severity: 'warn',
        code: 'ASSETLINKS_INVALID_FINGERPRINT',
        message: `${where} has a malformed fingerprint '${String(fingerprint)}' (expected 32 hex byte-pairs like AA:BB:...:FF)`,
        fix: 'use `keytool -list -v` output: 32 colon-separated uppercase hex byte-pairs.',
      });
    }
  }
}
