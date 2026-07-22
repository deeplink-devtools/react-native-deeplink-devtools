import type { Diagnostic, Route, RouteTable } from '../index.js';
import { matchAasaComponentPath, routePatternToExamplePath } from './components.js';
import type {
  AasaFile,
  AppLinksDetail,
  AasaReport,
  FetchedDocument,
  ValidateAasaOptions,
} from './types.js';

/** Maximum uncompressed AASA size Apple accepts. */
const MAX_AASA_BYTES = 128 * 1024;

/** Apple app-ID prefix: a 10-character alphanumeric Team ID, then `.<bundle id>`. */
const APP_ID_RE = /^[A-Z0-9]{10}\..+/;

/** A path pattern extracted from AASA, with the flags needed to match it. */
interface ComponentPattern {
  pattern: string;
  exclude: boolean;
  caseSensitive: boolean;
}

/**
 * Validate a fetched apple-app-site-association document: HTTPS delivery, no
 * redirects, size, JSON shape, and - when a {@link RouteTable} is supplied  -
 * that every route is covered by a non-excluded component and every component
 * covers at least one route.
 */
export function validateAasa(doc: FetchedDocument, opts: ValidateAasaOptions = {}): AasaReport {
  const diagnostics: Diagnostic[] = [];
  const notes: string[] = [];
  const report: AasaReport = {
    requestedUrl: doc.requestedUrl,
    diagnostics,
    notes,
  };

  if (doc.networkError !== undefined) {
    diagnostics.push({
      severity: 'error',
      code: 'AASA_FETCH_FAILED',
      message: `could not fetch ${doc.requestedUrl}: ${doc.networkError}`,
      fix: 'serve a valid apple-app-site-association at https://<domain>/.well-known/ (HTTP 200, no auth).',
    });
    return report;
  }

  // A redirect is terminal: Apple does not follow it, and there is no body to
  // validate. Report it precisely rather than as a generic fetch failure.
  if (doc.redirected) {
    diagnostics.push({
      severity: 'error',
      code: 'AASA_REDIRECTED',
      message: `${doc.requestedUrl} redirected${doc.redirectLocation !== undefined ? ` to ${doc.redirectLocation}` : ` (HTTP ${doc.status})`}; Apple does not follow redirects for the AASA`,
      fix: 'serve the file directly at the .well-known path with a 200 (no 3xx). If your apex redirects to www, validate the final host instead.',
    });
    return report;
  }

  if (!doc.ok) {
    diagnostics.push({
      severity: 'error',
      code: 'AASA_FETCH_FAILED',
      message: `${doc.requestedUrl} returned HTTP ${doc.status}`,
      fix: 'serve a valid apple-app-site-association at https://<domain>/.well-known/ (HTTP 200, no auth).',
    });
    return report;
  }

  report.fetchedFrom = doc.finalUrl;

  if (doc.scheme !== 'https') {
    diagnostics.push({
      severity: 'error',
      code: 'AASA_NOT_HTTPS',
      message: `served over ${doc.scheme}, but Apple only fetches the AASA over HTTPS`,
      fix: 'serve the file over HTTPS with a valid certificate.',
    });
  }

  if (doc.truncated || doc.byteLength > MAX_AASA_BYTES) {
    diagnostics.push({
      severity: 'error',
      code: 'AASA_TOO_LARGE',
      message: `the file is ${doc.byteLength}+ bytes; Apple rejects an uncompressed AASA larger than ${MAX_AASA_BYTES} bytes (128KB)`,
      fix: 'trim the components/paths so the uncompressed file is under 128KB.',
    });
  }

  if (doc.contentType !== undefined && !doc.contentType.includes('application/json')) {
    diagnostics.push({
      severity: 'warn',
      code: 'AASA_CONTENT_TYPE',
      message: `served with Content-Type '${doc.contentType}'; Apple ignores this, but a non-JSON type often means a router served an HTML fallback`,
      fix: "serve the file with Content-Type 'application/json'.",
    });
  }

  if (doc.truncated) {
    return report;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(doc.body);
  } catch (error) {
    diagnostics.push({
      severity: 'error',
      code: 'AASA_INVALID_JSON',
      message: `the body is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      fix: 'serve well-formed JSON (no comments, no trailing commas).',
    });
    return report;
  }

  const file = parsed as AasaFile;
  report.parsed = file;

  notes.push(
    'production devices fetch the AASA from the Apple CDN (app-site-association.cdn-apple.com); changes can take 24 hours or more to propagate (a first-time fetch can take days), or add `?mode=developer` to the associated-domains entitlement to bypass the CDN during development.',
  );

  if (typeof file.applinks !== 'object' || file.applinks === null) {
    diagnostics.push({
      severity: 'error',
      code: 'AASA_NO_APPLINKS',
      message: 'no `applinks` key; universal links will not work',
      fix: 'add an `applinks` object with a `details` array.',
    });
    return report;
  }

  const details = file.applinks.details;
  if (!Array.isArray(details) || details.length === 0) {
    diagnostics.push({
      severity: 'warn',
      code: 'AASA_NO_DETAILS',
      message: '`applinks.details` is missing or empty; no app is associated for universal links',
      fix: 'add at least one details entry with an appID and components.',
    });
    return report;
  }

  const patterns: ComponentPattern[] = [];
  details.forEach((detail, index) => validateDetail(detail, index, diagnostics, patterns));

  if (opts.table !== undefined) {
    crossCheck(opts.table, patterns, diagnostics);
  }

  return report;
}

/** Validate one `applinks.details[]` entry and collect its path patterns. */
function validateDetail(
  detail: AppLinksDetail,
  index: number,
  diagnostics: Diagnostic[],
  patterns: ComponentPattern[],
): void {
  const where = `applinks.details[${index}]`;
  const appIds = detail.appIDs ?? (detail.appID !== undefined ? [detail.appID] : []);
  if (appIds.length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'AASA_MISSING_APPID',
      message: `${where} has neither \`appID\` nor \`appIDs\``,
      fix: 'add "appID": "<TEAMID>.<BUNDLE_ID>" (or an "appIDs" array).',
    });
  }
  for (const appId of appIds) {
    if (!APP_ID_RE.test(appId)) {
      diagnostics.push({
        severity: 'warn',
        code: 'AASA_INVALID_APPID',
        message: `${where} appID '${appId}' is not in <TEAMID>.<BUNDLE_ID> form (10-char Team ID, then the bundle id)`,
        fix: 'use your 10-character Team ID followed by a dot and the bundle identifier.',
      });
    }
  }

  const hasComponents = Array.isArray(detail.components) && detail.components.length > 0;
  const hasPaths = Array.isArray(detail.paths) && detail.paths.length > 0;

  if (!hasComponents && !hasPaths) {
    diagnostics.push({
      severity: 'warn',
      code: 'AASA_NO_COMPONENTS',
      message: `${where} declares no \`components\` (or legacy \`paths\`); it matches no URLs`,
      fix: 'add a components array, e.g. [{ "/": "/*" }].',
    });
    return;
  }

  if (hasComponents) {
    (detail.components ?? []).forEach((component, componentIndex) => {
      const hasKey =
        component['/'] !== undefined ||
        component['?'] !== undefined ||
        component['#'] !== undefined;
      if (!hasKey) {
        diagnostics.push({
          severity: 'warn',
          code: 'AASA_INVALID_COMPONENT',
          message: `${where}.components[${componentIndex}] has none of the '/', '?' or '#' keys`,
          fix: "give the component a '/' path pattern (and optionally '?'/'#').",
        });
        return;
      }
      const path = component['/'];
      if (typeof path === 'string') {
        patterns.push({
          pattern: path,
          exclude: component.exclude === true,
          caseSensitive: component.caseSensitive === true,
        });
      }
    });
  }

  if (hasPaths) {
    diagnostics.push({
      severity: 'warn',
      code: 'AASA_LEGACY_PATHS',
      message: `${where} uses the pre-iOS-13 \`paths\` array; iOS 13+ ignores it in favor of \`components\``,
      fix: 'migrate `paths` entries to `components` (e.g. "/buy/*" -> { "/": "/buy/*" }).',
    });
    for (const rawPath of detail.paths ?? []) {
      const exclude = rawPath.startsWith('NOT ');
      patterns.push({
        pattern: exclude ? rawPath.slice(4).trim() : rawPath,
        exclude,
        caseSensitive: false,
      });
    }
  }
}

/** Cross-check the route table against the collected non-excluded path patterns. */
function crossCheck(
  table: RouteTable,
  patterns: ComponentPattern[],
  diagnostics: Diagnostic[],
): void {
  const includePatterns = patterns.filter((p) => !p.exclude);
  const examples = table.routes.map((route) => ({
    route,
    path: routePatternToExamplePath(route),
  }));

  for (const { route, path } of examples) {
    const covered = includePatterns.some((p) =>
      matchAasaComponentPath(p.pattern, path, { caseSensitive: p.caseSensitive }),
    );
    if (!covered) {
      diagnostics.push(missingRouteDiagnostic(route, path));
    }
  }

  for (const pattern of includePatterns) {
    const usedByAny = examples.some(({ path }) =>
      matchAasaComponentPath(pattern.pattern, path, { caseSensitive: pattern.caseSensitive }),
    );
    if (!usedByAny) {
      diagnostics.push({
        severity: 'warn',
        code: 'AASA_ORPHAN_PATTERN',
        message: `AASA component '${pattern.pattern}' matches none of the app's routes`,
        fix: 'remove the stale component, or confirm the route it targets still exists.',
      });
    }
  }
}

function missingRouteDiagnostic(route: Route, examplePath: string): Diagnostic {
  return {
    severity: 'error',
    code: 'AASA_MISSING_ROUTE',
    message: `route ${route.pattern} (e.g. ${examplePath}) is not matched by any non-excluded AASA component; universal links to it will open in the browser`,
    route,
    fix: `add a component covering it, e.g. { "/": "${examplePath}" } or a wildcard like { "/": "/*" }.`,
  };
}
