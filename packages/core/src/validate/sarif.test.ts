import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import { toSarif } from './sarif.js';
import type { ValidationResult } from './types.js';

const result: ValidationResult = {
  domain: 'example.com',
  aasa: {
    requestedUrl: 'https://example.com/.well-known/apple-app-site-association',
    fetchedFrom: 'https://example.com/.well-known/apple-app-site-association',
    diagnostics: [
      {
        severity: 'error',
        code: 'AASA_MISSING_ROUTE',
        message: 'route /users/:id is not covered',
        fix: 'add a component',
      },
    ],
    notes: ['a caching note'],
  },
  assetlinks: {
    requestedUrl: 'https://example.com/.well-known/assetlinks.json',
    fetchedFrom: 'https://example.com/.well-known/assetlinks.json',
    diagnostics: [
      { severity: 'warn', code: 'ASSETLINKS_CONTENT_TYPE', message: 'wrong content type' },
    ],
    notes: [],
  },
  diagnostics: [],
  notes: [],
};

describe('toSarif', () => {
  const sarif = toSarif(result, { toolVersion: '0.0.0' });

  it('emits a structurally valid SARIF 2.1.0 log', () => {
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.$schema).toContain('sarif-2.1.0');
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0]?.tool.driver.name).toBe('rndl');
    expect(sarif.runs[0]?.tool.driver.version).toBe('0.0.0');
  });

  it('maps each diagnostic and note to a result with required fields', () => {
    const results = sarif.runs[0]?.results ?? [];
    // 1 aasa error + 1 aasa note + 1 assetlinks warn.
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(typeof r.ruleId).toBe('string');
      expect(['error', 'warning', 'note']).toContain(r.level);
      expect(typeof r.message.text).toBe('string');
      expect(r.locations[0]?.physicalLocation.artifactLocation.uri).toContain('example.com');
    }
  });

  it('maps severities to SARIF levels and folds the fix into the message', () => {
    const results = sarif.runs[0]?.results ?? [];
    const missing = results.find((r) => r.ruleId === 'AASA_MISSING_ROUTE');
    expect(missing?.level).toBe('error');
    expect(missing?.message.text).toContain('Fix: add a component');
    expect(results.find((r) => r.ruleId === 'ASSETLINKS_CONTENT_TYPE')?.level).toBe('warning');
    expect(results.find((r) => r.ruleId === 'RNDL_NOTE')?.level).toBe('note');
  });

  it('declares every referenced rule id on the driver', () => {
    const rules = sarif.runs[0]?.tool.driver.rules ?? [];
    const ruleIds = new Set(rules.map((r) => r.id));
    for (const r of sarif.runs[0]?.results ?? []) {
      expect(ruleIds.has(r.ruleId)).toBe(true);
    }
    // No duplicate rules.
    expect(ruleIds.size).toBe(rules.length);
  });

  it('matches the SARIF snapshot', () => {
    expect(sarif).toMatchSnapshot();
  });

  // The committed fixture is the official OASIS SARIF 2.1.0 JSON schema
  // (json.schemastore.org/sarif-2.1.0.json), so this is the machine check that
  // GitHub code scanning will accept the log, hermetically.
  it('validates against the official SARIF 2.1.0 JSON schema', () => {
    const schema = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('./__fixtures__/sarif-schema-2.1.0.json', import.meta.url)),
        'utf8',
      ),
    ) as object;
    const ajv = new Ajv({ strict: false, allErrors: true });
    const validate = ajv.compile(schema);
    const valid = validate(sarif);
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });
});
