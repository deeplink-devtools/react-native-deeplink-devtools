import type { Route } from './index.js';

/** The outcome of building a concrete URL from a route pattern and parameters. */
export interface BuildRouteUrlResult {
  /** The built URL; absent when a required parameter is missing. */
  url?: string;
  /**
   * Required parameters with no supplied value; the URL cannot be built until
   * these are provided. `'*'` marks an unnamed wildcard segment (the pattern
   * cannot be filled from params — pass a full URL instead).
   */
  missing: string[];
  /** Supplied parameters the route does not declare; appended as query parameters. */
  extras: string[];
  /** Non-fatal remarks, e.g. a value that does not satisfy a `:param(regex)` constraint. */
  warnings: string[];
}

/**
 * Normalize a scheme or prefix into a joinable form: a bare scheme like
 * `myapp` becomes `myapp://`, an authority prefix like `https://example.com/`
 * keeps its host and loses the trailing slash. A prefix that already ends in
 * `://` is left as-is.
 */
export function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim();
  if (trimmed === '') {
    return '';
  }
  if (trimmed.includes('://')) {
    // scheme://authority — drop a trailing slash so path-joining is clean.
    // scheme:// with no authority (myapp://) is left exactly as written.
    return trimmed.endsWith('/') && !trimmed.endsWith('://')
      ? trimmed.replace(/\/+$/, '')
      : trimmed;
  }
  // Bare scheme: `myapp` -> `myapp://`; tolerate a stray trailing colon/slash.
  return `${trimmed.replace(/[:/]+$/, '')}://`;
}

/** One `/`-separated piece of a route pattern, classified for substitution. */
interface Segment {
  /** Literal text for a static segment; otherwise the parameter name. */
  value: string;
  kind: 'static' | 'param' | 'optional-param' | 'catch-all' | 'optional-catch-all' | 'unnamed';
  /** A `:name(regex)` constraint, without the surrounding parens. */
  regex?: string;
}

/** Classify one authored segment (`:id`, `:id?`, `:code(A|B)`, `*slug`, `[id]`, `[...slug]`, `about`). */
function classifySegment(raw: string): Segment {
  // Expo bracket forms, normalized defensively (adapters usually pre-convert these).
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1);
    if (inner.startsWith('...')) {
      return { value: inner.slice(3), kind: 'catch-all' };
    }
    return { value: inner, kind: 'param' };
  }

  if (raw.startsWith('*')) {
    const name = raw.slice(1);
    if (name === '') {
      return { value: '*', kind: 'unnamed' };
    }
    // Expo compiles `+not-found` to `*not-found`; treat any named catch-all as optional
    // so a URL to the parent path can still be built without it.
    return { value: name, kind: 'optional-catch-all' };
  }

  if (raw.startsWith(':')) {
    const body = raw.slice(1);
    const parenIndex = body.indexOf('(');
    if (parenIndex !== -1 && body.endsWith(')')) {
      return {
        value: body.slice(0, parenIndex),
        kind: 'param',
        regex: body.slice(parenIndex + 1, -1),
      };
    }
    if (body.endsWith('?')) {
      return { value: body.slice(0, -1), kind: 'optional-param' };
    }
    return { value: body, kind: 'param' };
  }

  return { value: raw, kind: 'static' };
}

/** Percent-encode a catch-all value while keeping its `/` separators. */
function encodeCatchAll(value: string): string {
  return value
    .split('/')
    .map((piece) => encodeURIComponent(piece))
    .join('/');
}

/**
 * Build a concrete deep-link URL from a route pattern, its parameters, and a
 * scheme/prefix. Path parameters are substituted into the pattern (missing
 * required ones are reported, not guessed), query parameters and any undeclared
 * extras are appended as a query string, and the result is joined onto the
 * normalized prefix. Pure; never throws.
 */
export function buildRouteUrl(
  route: Route,
  params: Record<string, string>,
  prefix: string,
): BuildRouteUrlResult {
  const missing: string[] = [];
  const warnings: string[] = [];
  const consumed = new Set<string>();

  // The pattern is path-only; a trailing `?` marks an optional param (query
  // params live in route.params, never inline), so it must not be stripped.
  const rawSegments = route.pattern.split('/').filter((segment) => segment !== '');

  const outSegments: string[] = [];
  for (const raw of rawSegments) {
    const segment = classifySegment(raw);
    switch (segment.kind) {
      case 'static': {
        outSegments.push(segment.value);
        break;
      }
      case 'unnamed': {
        missing.push('*');
        break;
      }
      case 'param':
      case 'optional-param': {
        const value = params[segment.value];
        if (value === undefined || value === '') {
          if (segment.kind === 'param') {
            missing.push(segment.value);
          }
          break;
        }
        consumed.add(segment.value);
        if (segment.regex !== undefined && !new RegExp(`^(?:${segment.regex})$`).test(value)) {
          warnings.push(
            `value '${value}' for :${segment.value} does not match its pattern (${segment.regex})`,
          );
        }
        outSegments.push(encodeURIComponent(value));
        break;
      }
      case 'catch-all':
      case 'optional-catch-all': {
        const value = params[segment.value];
        if (value === undefined || value === '') {
          if (segment.kind === 'catch-all') {
            missing.push(segment.value);
          }
          break;
        }
        consumed.add(segment.value);
        outSegments.push(encodeCatchAll(value));
        break;
      }
    }
  }

  // Query string: declared query params in route order, then undeclared extras.
  const query = new URLSearchParams();
  const extras: string[] = [];
  for (const param of route.params) {
    if (param.kind === 'query' && params[param.name] !== undefined) {
      query.append(param.name, params[param.name] as string);
      consumed.add(param.name);
    }
  }
  for (const [key, value] of Object.entries(params)) {
    if (!consumed.has(key)) {
      extras.push(key);
      query.append(key, value);
    }
  }

  if (missing.length > 0) {
    return { missing, extras, warnings };
  }

  const normalizedPrefix = normalizePrefix(prefix);
  const path = outSegments.join('/');
  const queryString = query.toString();

  // A scheme-only prefix (`myapp://`) takes the path with no leading slash;
  // an authority prefix (`https://host`) takes it with one.
  const isSchemeOnly = normalizedPrefix.endsWith('://');
  let url: string;
  if (isSchemeOnly) {
    url = `${normalizedPrefix}${path}`;
  } else if (normalizedPrefix === '') {
    url = `/${path}`;
  } else {
    url = path === '' ? normalizedPrefix : `${normalizedPrefix}/${path}`;
  }
  if (queryString !== '') {
    url += `?${queryString}`;
  }

  return { url, missing, extras, warnings };
}
