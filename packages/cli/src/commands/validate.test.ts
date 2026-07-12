import type { FetchedDocument, RouteTable } from '@deeplink-devtools/core';
import { describe, expect, it } from 'vitest';
import { buildValidateOutput } from './validate.js';

/** Build a healthy HTTPS FetchedDocument for the given `.well-known` file. */
function doc(
  path: string,
  body: unknown,
  overrides: Partial<FetchedDocument> = {},
): FetchedDocument {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const url = `https://example.com/.well-known/${path}`;
  return {
    requestedUrl: url,
    finalUrl: url,
    scheme: 'https',
    ok: true,
    status: 200,
    redirected: false,
    contentType: 'application/json',
    byteLength: Buffer.byteLength(text),
    truncated: false,
    body: text,
    ...overrides,
  };
}

const validAasa = doc('apple-app-site-association', {
  applinks: { details: [{ appID: 'ABCDE12345.com.example.app', components: [{ '/': '/*' }] }] },
});

const validAssetlinks = doc('assetlinks.json', [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.example.app',
      sha256_cert_fingerprints: [
        'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
      ],
    },
  },
]);

const baseOptions = {
  json: false,
  sarif: false,
  color: false,
  toolVersion: '0.0.0',
};

describe('buildValidateOutput', () => {
  it('reports clean and exits 0 for two valid files', () => {
    const output = buildValidateOutput('example.com', validAasa, validAssetlinks, baseOptions);
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain('apple-app-site-association - clean');
    expect(output.stdout).toContain('assetlinks.json - clean');
    expect(output.stdout).toContain('note:'); // CDN caching note
    expect(output.stdout).not.toContain(String.fromCharCode(27));
  });

  it('exits 1 and shows the diagnostic when a file is broken', () => {
    const brokenAasa = doc('apple-app-site-association', { webcredentials: {} });
    const output = buildValidateOutput('example.com', brokenAasa, validAssetlinks, baseOptions);
    expect(output.exitCode).toBe(1);
    expect(output.stdout).toContain('AASA_NO_APPLINKS');
  });

  it('runs the route cross-check when a table is supplied', () => {
    const table: RouteTable = {
      sourceType: 'expo-router',
      routes: [{ name: 'users/[id]', pattern: '/users/:id', params: [], exact: true }],
    };
    const narrowAasa = doc('apple-app-site-association', {
      applinks: {
        details: [{ appID: 'ABCDE12345.com.example.app', components: [{ '/': '/other/*' }] }],
      },
    });
    const output = buildValidateOutput('example.com', narrowAasa, validAssetlinks, {
      ...baseOptions,
      table,
    });
    expect(output.exitCode).toBe(1);
    expect(output.stdout).toContain('AASA_MISSING_ROUTE');
  });

  it('emits the full result as JSON', () => {
    const output = buildValidateOutput('example.com', validAasa, validAssetlinks, {
      ...baseOptions,
      json: true,
    });
    const parsed = JSON.parse(output.stdout) as {
      domain: string;
      aasa: { parsed?: unknown };
      assetlinks: { parsed?: unknown };
    };
    expect(parsed.domain).toBe('example.com');
    expect(parsed.aasa.parsed).toBeDefined();
    expect(parsed.assetlinks.parsed).toBeDefined();
    expect(parsed).toMatchSnapshot();
  });

  it('emits a SARIF 2.1.0 log', () => {
    const output = buildValidateOutput('example.com', validAasa, validAssetlinks, {
      ...baseOptions,
      sarif: true,
    });
    const sarif = JSON.parse(output.stdout) as {
      version: string;
      runs: { tool: { driver: { name: string } } }[];
    };
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0]?.tool.driver.name).toBe('rndl');
  });

  it('threads --package and --sha256 into the assetlinks check', () => {
    const output = buildValidateOutput('example.com', validAasa, validAssetlinks, {
      ...baseOptions,
      packageName: 'com.other.app',
    });
    expect(output.exitCode).toBe(1);
    expect(output.stdout).toContain('ASSETLINKS_PACKAGE_MISMATCH');
  });
});
