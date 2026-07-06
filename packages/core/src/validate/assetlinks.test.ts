import { describe, expect, it } from 'vitest';
import { validateAssetlinks } from './assetlinks.js';
import { doc } from './test-helpers.js';

const codesOf = (report: { diagnostics: { code: string }[] }) =>
  report.diagnostics.map((d) => d.code);

const FINGERPRINT =
  'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';

/** A minimal valid assetlinks statement list. */
const validAssetlinks = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.example.app',
      sha256_cert_fingerprints: [FINGERPRINT],
    },
  },
];

const assetlinksUrl = 'https://example.com/.well-known/assetlinks.json';

describe('validateAssetlinks', () => {
  it('passes a well-formed file with no diagnostics', () => {
    const report = validateAssetlinks(
      doc(validAssetlinks, { requestedUrl: assetlinksUrl, finalUrl: assetlinksUrl }),
    );
    expect(report.diagnostics).toEqual([]);
    expect(report.parsed).toHaveLength(1);
  });

  it('flags a non-HTTPS URL', () => {
    const report = validateAssetlinks(doc(validAssetlinks, { scheme: 'http' }));
    expect(codesOf(report)).toContain('ASSETLINKS_NOT_HTTPS');
  });

  it('reports a failed fetch', () => {
    const report = validateAssetlinks(doc('', { ok: false, status: 404 }));
    expect(codesOf(report)).toEqual(['ASSETLINKS_FETCH_FAILED']);
  });

  it('flags invalid JSON', () => {
    const report = validateAssetlinks(doc('nope'));
    expect(codesOf(report)).toContain('ASSETLINKS_INVALID_JSON');
  });

  it('flags a non-array top level', () => {
    const report = validateAssetlinks(doc({ relation: [] }));
    expect(codesOf(report)).toContain('ASSETLINKS_NOT_ARRAY');
  });

  it('errors when no statement grants handle_all_urls', () => {
    const report = validateAssetlinks(
      doc([
        {
          relation: ['delegate_permission/common.get_login_creds'],
          target: {
            namespace: 'android_app',
            package_name: 'com.example.app',
            sha256_cert_fingerprints: [FINGERPRINT],
          },
        },
      ]),
    );
    expect(codesOf(report)).toContain('ASSETLINKS_NO_HANDLE_ALL_URLS');
  });

  it('errors when no android_app target is present', () => {
    const report = validateAssetlinks(
      doc([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: { namespace: 'web', site: 'https://example.com' },
        },
      ]),
    );
    expect(codesOf(report)).toContain('ASSETLINKS_MISSING_ANDROID_APP');
  });

  it('errors when no fingerprints are listed', () => {
    const report = validateAssetlinks(
      doc([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: { namespace: 'android_app', package_name: 'com.example.app' },
        },
      ]),
    );
    expect(codesOf(report)).toContain('ASSETLINKS_NO_FINGERPRINTS');
  });

  it('warns on a malformed fingerprint', () => {
    const report = validateAssetlinks(
      doc([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: 'com.example.app',
            sha256_cert_fingerprints: ['deadbeef'],
          },
        },
      ]),
    );
    expect(codesOf(report)).toContain('ASSETLINKS_INVALID_FINGERPRINT');
  });

  it('warns on a missing package name', () => {
    const report = validateAssetlinks(
      doc([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: { namespace: 'android_app', sha256_cert_fingerprints: [FINGERPRINT] },
        },
      ]),
    );
    expect(codesOf(report)).toContain('ASSETLINKS_PACKAGE_MISSING');
  });

  it('errors when --package is not among the statements', () => {
    const report = validateAssetlinks(doc(validAssetlinks), { packageName: 'com.other.app' });
    expect(codesOf(report)).toContain('ASSETLINKS_PACKAGE_MISMATCH');
  });

  it('passes when --package matches', () => {
    const report = validateAssetlinks(doc(validAssetlinks), { packageName: 'com.example.app' });
    expect(report.diagnostics).toEqual([]);
  });

  it('errors when --sha256 is not listed', () => {
    const report = validateAssetlinks(doc(validAssetlinks), { sha256: '11:22:33' });
    expect(codesOf(report)).toContain('ASSETLINKS_FINGERPRINT_MISMATCH');
  });

  it('matches --sha256 case- and colon-insensitively', () => {
    const report = validateAssetlinks(doc(validAssetlinks), {
      packageName: 'com.example.app',
      sha256: FINGERPRINT.replace(/:/g, '').toLowerCase(),
    });
    expect(report.diagnostics).toEqual([]);
  });
});
