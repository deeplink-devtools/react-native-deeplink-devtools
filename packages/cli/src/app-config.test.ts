import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readAppConfig } from './app-config.js';

let dir: string | undefined;

afterEach(() => {
  if (dir !== undefined) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

function withAppJson(contents: string): string {
  dir = mkdtempSync(join(tmpdir(), 'rndl-appcfg-'));
  writeFileSync(join(dir, 'app.json'), contents);
  return dir;
}

describe('readAppConfig', () => {
  it('reads a string scheme and android package', () => {
    const cwd = withAppJson(
      JSON.stringify({ expo: { scheme: 'myapp', android: { package: 'com.example.app' } } }),
    );
    expect(readAppConfig(cwd)).toEqual({ scheme: 'myapp', androidPackage: 'com.example.app' });
  });

  it('takes the first entry of an array scheme', () => {
    const cwd = withAppJson(JSON.stringify({ expo: { scheme: ['first', 'second'] } }));
    expect(readAppConfig(cwd)).toEqual({ scheme: 'first' });
  });

  it('returns an empty object when app.json is absent', () => {
    expect(readAppConfig(mkdtempSync(join(tmpdir(), 'rndl-empty-')))).toEqual({});
  });

  it('returns an empty object for malformed JSON', () => {
    const cwd = withAppJson('{ not json');
    expect(readAppConfig(cwd)).toEqual({});
  });
});
