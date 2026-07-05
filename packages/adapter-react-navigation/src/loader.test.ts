import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadLinkingModule, parseConfigSpecifier } from './loader.js';

// Fixtures live inside src/ so they stay typechecked and linted, but tsup only
// bundles index.ts, so they never ship.
const FIXTURES_DIR = fileURLToPath(new URL('./__fixtures__', import.meta.url));

describe('parseConfigSpecifier', () => {
  it('passes a plain path through', () => {
    expect(parseConfigSpecifier('src/linking.ts')).toEqual({ modulePath: 'src/linking.ts' });
  });

  it('splits on the last #', () => {
    expect(parseConfigSpecifier('src/linking.ts#linking')).toEqual({
      modulePath: 'src/linking.ts',
      exportName: 'linking',
    });
    expect(parseConfigSpecifier('a#b#c')).toEqual({ modulePath: 'a#b', exportName: 'c' });
  });

  it('ignores a trailing #', () => {
    expect(parseConfigSpecifier('src/linking.ts#')).toEqual({ modulePath: 'src/linking.ts' });
  });
});

describe('loadLinkingModule', () => {
  it('picks an explicitly named export', async () => {
    const loaded = await loadLinkingModule('named-export.ts#linking', { cwd: FIXTURES_DIR });
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.value).toMatchObject({ prefixes: ['fixture://'] });
    expect(loaded.sourceFile).toBe('named-export.ts');
  });

  it('falls back to the default export, then to `linking`', async () => {
    const viaDefault = await loadLinkingModule('default-export.ts', { cwd: FIXTURES_DIR });
    expect(viaDefault.value).toMatchObject({ config: { screens: { About: 'about' } } });

    const viaLinking = await loadLinkingModule('named-export.ts', { cwd: FIXTURES_DIR });
    expect(viaLinking.value).toMatchObject({ config: { screens: { Home: 'home' } } });
  });

  it('reports CONFIG_EXPORT_NOT_FOUND with the available exports', async () => {
    const missing = await loadLinkingModule('named-export.ts#nope', { cwd: FIXTURES_DIR });
    expect(missing.value).toBeUndefined();
    expect(missing.diagnostics[0]?.code).toBe('CONFIG_EXPORT_NOT_FOUND');
    expect(missing.diagnostics[0]?.message).toContain("'nope'");
    expect(missing.diagnostics[0]?.message).toContain('linking');

    const noDefault = await loadLinkingModule('other-export.ts', { cwd: FIXTURES_DIR });
    expect(noDefault.diagnostics[0]?.code).toBe('CONFIG_EXPORT_NOT_FOUND');
    expect(noDefault.diagnostics[0]?.fix).toContain('#<exportName>');
  });

  it('reports CONFIG_LOAD_FAILED for a missing file', async () => {
    const loaded = await loadLinkingModule('does-not-exist.ts', { cwd: FIXTURES_DIR });
    expect(loaded.value).toBeUndefined();
    expect(loaded.diagnostics[0]?.code).toBe('CONFIG_LOAD_FAILED');
    expect(loaded.diagnostics[0]?.message).toContain('not found');
  });

  it('turns an import-time crash into the isolated-module guidance (acceptance)', async () => {
    const loaded = await loadLinkingModule('side-effects/linking.ts', { cwd: FIXTURES_DIR });
    expect(loaded.value).toBeUndefined();
    const diag = loaded.diagnostics[0];
    expect(diag?.code).toBe('CONFIG_LOAD_FAILED');
    expect(diag?.severity).toBe('error');
    expect(diag?.message).toContain("Native module 'PlatformConstants' is not available");
    expect(diag?.fix).toContain('isolated module');
    expect(diag?.fix).toContain('import type');
  });
});
