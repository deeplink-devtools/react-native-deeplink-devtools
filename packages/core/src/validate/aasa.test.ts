import { describe, expect, it } from 'vitest';
import type { RouteTable } from '../index.js';
import { validateAasa } from './aasa.js';
import { doc } from './test-helpers.js';

const codesOf = (report: { diagnostics: { code: string }[] }) =>
  report.diagnostics.map((d) => d.code);

/** A minimal valid AASA with one wildcard component. */
const validAasa = {
  applinks: {
    details: [{ appID: 'ABCDE12345.com.example.app', components: [{ '/': '/*' }] }],
  },
};

describe('validateAasa: HTTP delivery', () => {
  it('passes a well-formed HTTPS file with no diagnostics', () => {
    const report = validateAasa(doc(validAasa));
    expect(report.diagnostics).toEqual([]);
    expect(report.parsed).toBeDefined();
    expect(report.notes.length).toBeGreaterThan(0); // CDN-caching note
  });

  it('flags a non-HTTPS URL', () => {
    const report = validateAasa(
      doc(validAasa, { scheme: 'http', finalUrl: 'http://example.com/x' }),
    );
    expect(codesOf(report)).toContain('AASA_NOT_HTTPS');
  });

  it('flags a redirect', () => {
    const report = validateAasa(
      doc(validAasa, { redirected: true, redirectLocation: 'https://example.com/aasa' }),
    );
    expect(codesOf(report)).toContain('AASA_REDIRECTED');
  });

  it('flags a file over 128KB', () => {
    const report = validateAasa(doc(validAasa, { byteLength: 200 * 1024 }));
    expect(codesOf(report)).toContain('AASA_TOO_LARGE');
  });

  it('flags a truncated file and does not attempt to parse it', () => {
    const report = validateAasa(doc('{ "applinks', { truncated: true, byteLength: 200 * 1024 }));
    expect(codesOf(report)).toContain('AASA_TOO_LARGE');
    expect(codesOf(report)).not.toContain('AASA_INVALID_JSON');
    expect(report.parsed).toBeUndefined();
  });

  it('warns on a non-JSON Content-Type', () => {
    const report = validateAasa(doc(validAasa, { contentType: 'text/html' }));
    expect(codesOf(report)).toContain('AASA_CONTENT_TYPE');
  });

  it('reports a failed fetch (non-2xx)', () => {
    const report = validateAasa(doc('', { ok: false, status: 404 }));
    expect(codesOf(report)).toEqual(['AASA_FETCH_FAILED']);
  });

  it('reports a network error', () => {
    const report = validateAasa(doc('', { ok: false, status: 0, networkError: 'ENOTFOUND' }));
    expect(codesOf(report)).toEqual(['AASA_FETCH_FAILED']);
    expect(report.diagnostics[0]?.message).toContain('ENOTFOUND');
  });
});

describe('validateAasa: JSON schema', () => {
  it('flags invalid JSON', () => {
    const report = validateAasa(doc('{ not json'));
    expect(codesOf(report)).toContain('AASA_INVALID_JSON');
  });

  it('flags a missing applinks key', () => {
    const report = validateAasa(doc({ webcredentials: {} }));
    expect(codesOf(report)).toContain('AASA_NO_APPLINKS');
  });

  it('warns on missing details', () => {
    const report = validateAasa(doc({ applinks: { apps: [] } }));
    expect(codesOf(report)).toContain('AASA_NO_DETAILS');
  });

  it('errors on a details entry with no appID', () => {
    const report = validateAasa(doc({ applinks: { details: [{ components: [{ '/': '/*' }] }] } }));
    expect(codesOf(report)).toContain('AASA_MISSING_APPID');
  });

  it('warns on a malformed appID', () => {
    const report = validateAasa(
      doc({ applinks: { details: [{ appID: 'com.example.app', components: [{ '/': '/*' }] }] } }),
    );
    expect(codesOf(report)).toContain('AASA_INVALID_APPID');
  });

  it('accepts the iOS 13+ appIDs array', () => {
    const report = validateAasa(
      doc({
        applinks: {
          details: [{ appIDs: ['ABCDE12345.com.example.app'], components: [{ '/': '/*' }] }],
        },
      }),
    );
    expect(report.diagnostics).toEqual([]);
  });

  it('warns when a detail has no components or paths', () => {
    const report = validateAasa(
      doc({ applinks: { details: [{ appID: 'ABCDE12345.com.example.app' }] } }),
    );
    expect(codesOf(report)).toContain('AASA_NO_COMPONENTS');
  });

  it('warns on a component with none of the / ? # keys', () => {
    const report = validateAasa(
      doc({
        applinks: {
          details: [{ appID: 'ABCDE12345.com.example.app', components: [{ comment: 'oops' }] }],
        },
      }),
    );
    expect(codesOf(report)).toContain('AASA_INVALID_COMPONENT');
  });

  it('warns on legacy paths but still accepts the file', () => {
    const report = validateAasa(
      doc({ applinks: { details: [{ appID: 'ABCDE12345.com.example.app', paths: ['/buy/*'] }] } }),
    );
    expect(codesOf(report)).toEqual(['AASA_LEGACY_PATHS']);
  });
});

describe('validateAasa: route cross-check', () => {
  const table: RouteTable = {
    sourceType: 'expo-router',
    routes: [
      { name: 'users/[id]', pattern: '/users/:id', params: [], exact: true },
      { name: 'posts/[...slug]', pattern: '/posts/*slug', params: [], exact: false },
    ],
  };

  it('passes when a wildcard component covers every route', () => {
    const report = validateAasa(doc(validAasa), { table });
    expect(report.diagnostics).toEqual([]);
  });

  it('errors on a route no component matches', () => {
    const aasa = {
      applinks: {
        details: [{ appID: 'ABCDE12345.com.example.app', components: [{ '/': '/users/*' }] }],
      },
    };
    const report = validateAasa(doc(aasa), { table });
    const missing = report.diagnostics.filter((d) => d.code === 'AASA_MISSING_ROUTE');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.route?.pattern).toBe('/posts/*slug');
    expect(missing[0]?.severity).toBe('error');
  });

  it('warns on a component that matches no route', () => {
    const aasa = {
      applinks: {
        details: [
          {
            appID: 'ABCDE12345.com.example.app',
            components: [{ '/': '/*' }, { '/': '/legacy/*' }],
          },
        ],
      },
    };
    const report = validateAasa(doc(aasa), { table });
    const orphan = report.diagnostics.filter((d) => d.code === 'AASA_ORPHAN_PATTERN');
    expect(orphan).toHaveLength(1);
    expect(orphan[0]?.message).toContain('/legacy/*');
  });

  it('does not count excluded components as coverage', () => {
    const aasa = {
      applinks: {
        details: [
          {
            appID: 'ABCDE12345.com.example.app',
            components: [{ '/': '/users/*', exclude: true }, { '/': '/posts/*' }],
          },
        ],
      },
    };
    const report = validateAasa(doc(aasa), { table });
    const missing = report.diagnostics.filter((d) => d.code === 'AASA_MISSING_ROUTE');
    expect(missing.map((d) => d.route?.pattern)).toEqual(['/users/:id']);
  });
});
